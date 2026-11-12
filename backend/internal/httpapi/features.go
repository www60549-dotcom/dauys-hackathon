package httpapi

import (
	"context"
	"dauys/internal/service"
	"errors"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func featureError(c *fiber.Ctx, err error) error {
	var conflict *service.VersionConflict
	if errors.As(err, &conflict) {
		return c.Status(409).JSON(fiber.Map{"error": conflict.Error(), "code": "version_conflict", "current_version": conflict.CurrentVersion})
	}
	if errors.Is(err, service.ErrVersionRequired) {
		return c.Status(428).JSON(fiber.Map{"error": err.Error(), "code": "version_required"})
	}
	if errors.Is(err, service.ErrInvalidTransition) {
		return c.Status(409).JSON(fiber.Map{"error": err.Error(), "code": "invalid_transition"})
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return fail(c, 503, "Запрос не завершён вовремя. Повторите попытку")
	}
	if errors.Is(err, service.ErrForbidden) {
		return fail(c, 403, err.Error())
	}
	if errors.Is(err, service.ErrConflict) {
		return fail(c, 409, err.Error())
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return fail(c, 404, "Обращение или пилот не найден")
	}
	var pgerr *pgconn.PgError
	if errors.As(err, &pgerr) {
		return err
	}
	return fail(c, 400, err.Error())
}
func (a *API) features(c *fiber.Ctx) error {
	ctx, cancel := service.Context()
	defer cancel()
	id := c.Params("id")
	tx, err := a.Svc.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return featureError(c, err)
	}
	defer tx.Rollback(ctx)
	var version int
	var status, kind, author, assignee string
	if err = tx.QueryRow(ctx, `SELECT version,status,kind,author_id,coalesce(assignee_id,'') FROM appeals WHERE id=$1`, id).Scan(&version, &status, &kind, &author, &assignee); err != nil {
		return featureError(c, err)
	}
	u := user(c)
	active := status != "resolved" && status != "closed" && status != "rejected"
	manager := u.Role == "admin" || u.Role == "executor" && u.ID == assignee
	permissions := fiber.Map{"can_assess": kind != "praise" && active && (manager || u.ID == author && (status == "new" || status == "waiting")), "can_pilot": kind != "praise" && active && manager}
	impacts, err := mapsFrom(ctx, tx, `SELECT people,minutes,occurrences_month,hourly_rate,round((people*minutes*occurrences_month/60)::numeric,2)::float8 AS hours_month,round((people*minutes*occurrences_month/60*hourly_rate)::numeric,2)::float8 AS cost_month,updated_at FROM appeal_impact WHERE appeal_id=$1`, id)
	if err != nil {
		return err
	}
	pilots, err := mapsFrom(ctx, tx, `SELECT p.id,p.hypothesis,p.scope,p.metric,p.unit,p.baseline,p.target,p.actual,p.direction,p.owner_id,u.name AS owner,to_char(p.end_at,'YYYY-MM-DD') AS end_at,p.state,p.conclusion,p.version,p.created_at,p.started_at,p.evaluated_at,CASE WHEN p.actual IS NULL THEN NULL ELSE CASE WHEN p.direction='decrease' THEN p.actual<=p.target ELSE p.actual>=p.target END END AS goal_met FROM pilot_experiments p JOIN users u ON u.id=p.owner_id WHERE appeal_id=$1 ORDER BY p.id DESC LIMIT 20`, id)
	if err != nil {
		return err
	}
	recurrences, err := mapsFrom(ctx, tx, `SELECT r.id,r.reason,r.previous_result,r.previous_effect,r.previous_confirmed_at,r.created_at,u.name AS author FROM appeal_recurrences r JOIN users u ON u.id=r.author_id WHERE appeal_id=$1 ORDER BY r.id DESC LIMIT 30`, id)
	if err != nil {
		return err
	}
	var impact any
	if len(impacts) > 0 {
		impact = impacts[0]
	}
	if err = tx.Commit(ctx); err != nil {
		return featureError(c, err)
	}
	return c.JSON(fiber.Map{"appeal_version": version, "permissions": permissions, "impact": impact, "pilots": pilots, "recurrences": recurrences})
}
func (a *API) saveImpact(c *fiber.Ctx) error {
	var in service.ImpactInput
	if c.BodyParser(&in) != nil {
		return fail(c, 400, "Проверьте параметры расчёта")
	}
	ctx, cancel := service.Context()
	defer cancel()
	if err := a.Svc.SaveImpact(ctx, user(c), c.Params("id"), in); err != nil {
		return featureError(c, err)
	}
	return c.JSON(fiber.Map{"ok": true})
}
func (a *API) savePilot(c *fiber.Ctx) error {
	var in service.PilotInput
	if c.BodyParser(&in) != nil {
		return fail(c, 400, "Проверьте паспорт пилота")
	}
	ctx, cancel := service.Context()
	defer cancel()
	if err := a.Svc.SavePilot(ctx, user(c), c.Params("id"), in); err != nil {
		return featureError(c, err)
	}
	return c.JSON(fiber.Map{"ok": true})
}
func (a *API) reopen(c *fiber.Ctx) error {
	var in struct {
		Reason          string `json:"reason"`
		ExpectedVersion int    `json:"expected_version"`
	}
	if c.BodyParser(&in) != nil {
		return fail(c, 400, "Опишите повторение проблемы")
	}
	ctx, cancel := service.Context()
	defer cancel()
	if err := a.Svc.Reopen(ctx, user(c), c.Params("id"), in.Reason, in.ExpectedVersion); err != nil {
		return featureError(c, err)
	}
	return c.JSON(fiber.Map{"ok": true})
}
func (a *API) similar(c *fiber.Ctx) error {
	text := c.Query("text")
	if len([]rune(text)) < 4 {
		return c.JSON(fiber.Map{"items": []service.SimilarCandidate{}, "method": "local_concepts"})
	}
	if len(text) > 12000 {
		return fail(c, 400, "Слишком длинный текст поиска")
	}
	ctx, cancel := service.Context()
	defer cancel()
	items, err := a.Svc.Similar(ctx, text, c.Query("exclude"))
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"items": items, "method": "local_concepts", "note": "Тематические синонимы и основы слов. Подсказка не объединяет обращения автоматически."})
}

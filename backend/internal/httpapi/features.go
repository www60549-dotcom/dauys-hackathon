package httpapi

import (
	"dauys/internal/service"
	"errors"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func featureError(c *fiber.Ctx, err error) error {
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
	if _, err := a.Svc.Get(ctx, user(c).ID, id); err != nil {
		return featureError(c, err)
	}
	impacts, err := a.maps(ctx, `SELECT people,minutes,occurrences_month,hourly_rate,round((people*minutes*occurrences_month/60)::numeric,2)::float8 AS hours_month,round((people*minutes*occurrences_month/60*hourly_rate)::numeric,2)::float8 AS cost_month,updated_at FROM appeal_impact WHERE appeal_id=$1`, id)
	if err != nil {
		return err
	}
	pilots, err := a.maps(ctx, `SELECT p.id,p.hypothesis,p.scope,p.metric,p.unit,p.baseline,p.target,p.actual,p.direction,p.owner_id,u.name AS owner,to_char(p.end_at,'YYYY-MM-DD') AS end_at,p.state,p.conclusion,p.version,p.created_at,p.started_at,p.evaluated_at,CASE WHEN p.actual IS NULL THEN NULL ELSE CASE WHEN p.direction='decrease' THEN p.actual<=p.target ELSE p.actual>=p.target END END AS goal_met FROM pilot_experiments p JOIN users u ON u.id=p.owner_id WHERE appeal_id=$1 ORDER BY p.id DESC LIMIT 20`, id)
	if err != nil {
		return err
	}
	recurrences, err := a.maps(ctx, `SELECT r.id,r.reason,r.previous_result,r.previous_effect,r.previous_confirmed_at,r.created_at,u.name AS author FROM appeal_recurrences r JOIN users u ON u.id=r.author_id WHERE appeal_id=$1 ORDER BY r.id DESC LIMIT 30`, id)
	if err != nil {
		return err
	}
	var impact any
	if len(impacts) > 0 {
		impact = impacts[0]
	}
	return c.JSON(fiber.Map{"impact": impact, "pilots": pilots, "recurrences": recurrences})
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
		Reason string `json:"reason"`
	}
	if c.BodyParser(&in) != nil {
		return fail(c, 400, "Опишите повторение проблемы")
	}
	ctx, cancel := service.Context()
	defer cancel()
	if err := a.Svc.Reopen(ctx, user(c), c.Params("id"), in.Reason); err != nil {
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

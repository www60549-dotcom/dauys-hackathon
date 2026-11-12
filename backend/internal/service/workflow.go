package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrVersionRequired = errors.New("Для изменения нужна версия обращения. Обновите карточку")
var ErrInvalidTransition = errors.New("Этот переход статуса недоступен. Проверьте актуальное состояние обращения")

type VersionConflict struct{ CurrentVersion int }

func (e *VersionConflict) Error() string { return ErrConflict.Error() }
func (e *VersionConflict) Unwrap() error { return ErrConflict }

// UpdateInput is a command DTO, separate from the response model. Omitted fields
// are preserved. Legacy full payloads can carry version, but never bypass a check.
type UpdateInput struct {
	Action          string     `json:"action"`
	ExpectedVersion int        `json:"expected_version"`
	LegacyVersion   int        `json:"version"`
	Title           *string    `json:"title"`
	Description     *string    `json:"description"`
	Solution        *string    `json:"solution"`
	Status          *string    `json:"status"`
	Priority        *string    `json:"priority"`
	AssigneeID      *string    `json:"assignee_id"`
	ParentID        *string    `json:"parent_id"`
	Result          *string    `json:"result"`
	ActualEffect    *int       `json:"actual_effect"`
	DueAt           *time.Time `json:"due_at"`
}

func manager(u User, a Appeal) bool {
	return u.Role == "admin" || u.Role == "executor" && u.ID == a.AssigneeID
}

func manageTransitions(kind, status string) []string {
	if status == "closed" || status == "rejected" {
		return []string{}
	}
	if status == "resolved" {
		if kind == "praise" {
			return []string{"closed"}
		}
		return []string{"resolved"}
	}
	result := []string{status}
	for _, next := range []string{"review", "progress", "waiting", "resolved", "rejected"} {
		if next != status && (kind != "praise" || next != "resolved") {
			result = append(result, next)
		}
	}
	if kind == "praise" {
		result = append(result, "closed")
	}
	return result
}

func AllowedTransitions(u User, a Appeal) []string {
	result := []string{}
	if manager(u, a) {
		result = manageTransitions(a.Kind, a.Status)
	}
	if u.ID == a.AuthorID && a.Status == "resolved" && a.Kind != "praise" {
		result = append(result, "closed")
	}
	return result
}

func (s *Service) Update(ctx context.Context, u User, id string, in UpdateInput) (int, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	current, err := scan(tx.QueryRow(ctx, `SELECT `+cols+joins+` WHERE a.id=$2 FOR UPDATE OF a`, u.ID, id))
	if err != nil {
		return 0, err
	}
	action := in.Action
	if action == "" {
		if in.Status != nil && *in.Status == "closed" && u.ID == current.AuthorID && current.Status == "resolved" {
			action = "confirm"
		} else if manager(u, current) {
			action = "manage"
		} else {
			action = "edit"
		}
	}
	switch action {
	case "confirm":
		if u.ID != current.AuthorID {
			return 0, ErrForbidden
		}
	case "edit":
		if u.ID != current.AuthorID {
			return 0, ErrForbidden
		}
	case "manage":
		if !manager(u, current) {
			return 0, ErrForbidden
		}
	default:
		return 0, errors.New("Неизвестное действие с обращением")
	}
	if in.ExpectedVersion == 0 && in.Action == "" {
		in.ExpectedVersion = in.LegacyVersion
	}
	if in.ExpectedVersion < 1 {
		return 0, ErrVersionRequired
	}
	if in.ExpectedVersion != current.Version {
		return 0, &VersionConflict{CurrentVersion: current.Version}
	}
	next := current
	eventType, label := "appeal_edited", "Автор уточнил описание обращения"
	switch action {
	case "confirm":
		if current.Status != "resolved" || current.Kind == "praise" {
			return 0, ErrInvalidTransition
		}
		next.Status = "closed"
		eventType, label = "result_confirmed", "Автор подтвердил решение"
	case "edit":
		if !oneOf(current.Status, "new", "waiting") {
			return 0, ErrInvalidTransition
		}
		if in.Title == nil && in.Description == nil && in.Solution == nil {
			return 0, errors.New("Укажите изменения описания")
		}
		if in.Title != nil {
			next.Title = strings.TrimSpace(*in.Title)
		}
		if in.Description != nil {
			next.Description = strings.TrimSpace(*in.Description)
		}
		if in.Solution != nil {
			next.Solution = strings.TrimSpace(*in.Solution)
		}
		if len([]rune(next.Title)) < 5 || len([]rune(next.Title)) > 180 || len([]rune(next.Description)) < 10 || len(next.Description) > 20000 || len(next.Solution) > 10000 {
			return 0, errors.New("Проверьте заголовок и описание")
		}
		if in.Action != "" && (in.Status != nil || in.Priority != nil || in.AssigneeID != nil || in.ParentID != nil || in.Result != nil || in.ActualEffect != nil || in.DueAt != nil) {
			return 0, ErrForbidden
		}
	case "manage":
		if in.Status != nil {
			next.Status = *in.Status
		}
		if in.Priority != nil {
			next.Priority = *in.Priority
		}
		if in.AssigneeID != nil {
			next.AssigneeID = *in.AssigneeID
		}
		if in.ParentID != nil {
			next.ParentID = *in.ParentID
		}
		if in.Result != nil {
			next.Result = strings.TrimSpace(*in.Result)
		}
		if in.ActualEffect != nil {
			next.ActualEffect = *in.ActualEffect
		}
		if in.DueAt != nil {
			next.DueAt = *in.DueAt
		}
		if !oneOf(next.Status, "new", "review", "progress", "waiting", "resolved", "closed", "rejected") || !oneOf(next.Priority, "low", "medium", "high", "critical") {
			return 0, errors.New("Некорректный статус или приоритет")
		}
		if !oneOf(next.Status, manageTransitions(current.Kind, current.Status)...) {
			return 0, ErrInvalidTransition
		}
		if (oneOf(next.Status, "resolved", "rejected") || current.Kind == "praise" && next.Status == "closed") && len([]rune(next.Result)) < 10 {
			return 0, errors.New("Опишите решение или причину ответа (от 10 символов)")
		}
		if len(next.Result) > 10000 || next.ActualEffect < 0 || next.ActualEffect > 1000000000 || current.Kind == "praise" && next.ActualEffect != 0 {
			return 0, errors.New("Проверьте решение и фактический эффект")
		}
		if next.DueAt.IsZero() {
			return 0, errors.New("Укажите срок")
		}
		if oneOf(next.Status, "resolved", "rejected", "closed") {
			var active bool
			if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pilot_experiments WHERE appeal_id=$1 AND state IN ('planned','running'))`, id).Scan(&active); err != nil {
				return 0, err
			}
			if active {
				return 0, errors.New("Сначала подведите итоги активного пилота, затем зафиксируйте решение обращения")
			}
		}
		if next.AssigneeID != "" {
			var role string
			if err = tx.QueryRow(ctx, `SELECT role FROM users WHERE id=$1`, next.AssigneeID).Scan(&role); errors.Is(err, pgx.ErrNoRows) {
				return 0, errors.New("Выберите исполнителя")
			} else if err != nil {
				return 0, err
			}
			if role == "employee" {
				return 0, errors.New("Выберите исполнителя")
			}
		}
		if next.ParentID != current.ParentID && next.ParentID != "" {
			if next.ParentID == id {
				return 0, errors.New("Нельзя связать обращение с самим собой")
			}
			var parent *string
			if err = tx.QueryRow(ctx, `SELECT parent_id FROM appeals WHERE id=$1 FOR UPDATE`, next.ParentID).Scan(&parent); errors.Is(err, pgx.ErrNoRows) {
				return 0, errors.New("Выберите самостоятельную тему")
			} else if err != nil {
				return 0, err
			}
			if parent != nil {
				return 0, errors.New("Выберите самостоятельную тему")
			}
			var children int
			if err = tx.QueryRow(ctx, `SELECT count(*) FROM appeals WHERE parent_id=$1`, id).Scan(&children); err != nil {
				return 0, err
			}
			if children > 0 {
				return 0, errors.New("Тема уже содержит связанные обращения")
			}
		}
		eventType, label = "appeal_managed", "Обновлены параметры обращения"
		if next.Status != current.Status {
			eventType, label = "status_changed", "Изменён статус обращения"
		}
	}
	fields := changedFields(current, next)
	if len(fields) == 0 {
		return current.Version, nil
	}
	var version int
	err = tx.QueryRow(ctx, `UPDATE appeals SET title=$2,description=$3,solution=$4,status=$5,priority=$6,assignee_id=nullif($7,''),parent_id=nullif($8,''),result=$9,actual_effect=$10,due_at=$11,confirmed_at=CASE WHEN $12 THEN now() ELSE NULL END WHERE id=$1 AND version=$13 RETURNING version`, id, next.Title, next.Description, next.Solution, next.Status, next.Priority, next.AssigneeID, next.ParentID, next.Result, next.ActualEffect, next.DueAt, action == "confirm", in.ExpectedVersion).Scan(&version)
	if err != nil {
		return 0, err
	}
	from, to := "", ""
	if current.Status != next.Status {
		from, to = current.Status, next.Status
	}
	if err = recordEvent(ctx, tx, id, u, eventType, label, from, to, map[string]any{"fields": fields, "previous_version": current.Version}); err != nil {
		return 0, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO notifications(user_id,appeal_id,body) SELECT DISTINCT x,$1,$2 FROM unnest(ARRAY[$3,$4,$5]) x WHERE x<>'' AND x<>$6`, id, label, current.AuthorID, current.AssigneeID, next.AssigneeID, u.ID)
	if err != nil {
		return 0, err
	}
	return version, tx.Commit(ctx)
}

func changedFields(a, b Appeal) []string {
	fields := []string{}
	for _, item := range []struct {
		name    string
		changed bool
	}{
		{"title", a.Title != b.Title}, {"description", a.Description != b.Description}, {"solution", a.Solution != b.Solution},
		{"status", a.Status != b.Status}, {"priority", a.Priority != b.Priority}, {"assignee_id", a.AssigneeID != b.AssigneeID},
		{"parent_id", a.ParentID != b.ParentID}, {"result", a.Result != b.Result}, {"actual_effect", a.ActualEffect != b.ActualEffect}, {"due_at", !a.DueAt.Equal(b.DueAt)},
	} {
		if item.changed {
			fields = append(fields, item.name)
		}
	}
	return fields
}

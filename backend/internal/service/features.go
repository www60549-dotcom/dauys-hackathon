package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type ImpactInput struct {
	ExpectedAppealVersion int     `json:"expected_appeal_version"`
	People                int     `json:"people"`
	Minutes               float64 `json:"minutes"`
	OccurrencesMonth      float64 `json:"occurrences_month"`
	HourlyRate            float64 `json:"hourly_rate"`
}

func (i ImpactInput) Validate() error {
	if i.People < 1 || i.People > 100000 || !validNumber(i.Minutes, 1440) || !validNumber(i.OccurrencesMonth, 1000) || !validNumber(i.HourlyRate, 1000000) {
		return errors.New("Проверьте охват, минуты, частоту и стоимость часа")
	}
	return nil
}
func validNumber(v, max float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= 0 && v <= max
}
func SaveImpactTx(ctx context.Context, tx pgx.Tx, id string, i ImpactInput) error {
	if err := i.Validate(); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `INSERT INTO appeal_impact(appeal_id,people,minutes,occurrences_month,hourly_rate) VALUES($1,$2,$3,$4,$5) ON CONFLICT(appeal_id) DO UPDATE SET people=excluded.people,minutes=excluded.minutes,occurrences_month=excluded.occurrences_month,hourly_rate=excluded.hourly_rate,updated_at=now()`, id, i.People, i.Minutes, i.OccurrencesMonth, i.HourlyRate)
	return err
}

var ErrForbidden = errors.New("Нет прав на это действие")
var ErrConflict = errors.New("Данные уже изменились. Обновите карточку и повторите действие")

type lockedAppeal struct {
	Author, Assignee, Status, Kind string
	Version                        int
}

func lockAppeal(ctx context.Context, tx pgx.Tx, id string) (lockedAppeal, error) {
	var a lockedAppeal
	err := tx.QueryRow(ctx, `SELECT author_id,coalesce(assignee_id,''),status,kind,version FROM appeals WHERE id=$1 FOR UPDATE`, id).Scan(&a.Author, &a.Assignee, &a.Status, &a.Kind, &a.Version)
	return a, err
}
func manages(u User, a lockedAppeal) bool {
	return u.Role == "admin" || u.Role == "executor" && u.ID == a.Assignee
}
func recordFeature(ctx context.Context, tx pgx.Tx, id string, u User, a lockedAppeal, action, eventType string) error {
	var status string
	if err := tx.QueryRow(ctx, `SELECT status FROM appeals WHERE id=$1`, id).Scan(&status); err != nil {
		return err
	}
	from, to := "", ""
	if status != a.Status {
		from, to = a.Status, status
	}
	if err := recordEvent(ctx, tx, id, u, eventType, action, from, to, nil); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `INSERT INTO notifications(user_id,appeal_id,body) SELECT DISTINCT x,$1,$2 FROM unnest(ARRAY[$3,$4]) x WHERE x<>'' AND x<>$5`, id, action, a.Author, a.Assignee, u.ID)
	return err
}
func (s *Service) SaveImpact(ctx context.Context, u User, id string, in ImpactInput) error {
	if err := in.Validate(); err != nil {
		return err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	a, err := lockAppeal(ctx, tx, id)
	if err != nil {
		return err
	}
	if !manages(u, a) && !(u.ID == a.Author && (a.Status == "new" || a.Status == "waiting")) {
		return ErrForbidden
	}
	if in.ExpectedAppealVersion < 1 {
		return ErrVersionRequired
	}
	if in.ExpectedAppealVersion != a.Version {
		return &VersionConflict{CurrentVersion: a.Version}
	}
	if a.Kind == "praise" || oneOf(a.Status, "resolved", "closed", "rejected") {
		return ErrInvalidTransition
	}
	if err = SaveImpactTx(ctx, tx, id, in); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE appeals SET updated_at=now() WHERE id=$1`, id); err != nil {
		return err
	}
	if err = recordFeature(ctx, tx, id, u, a, "Обновлена расчётная цена ожидания (оценка, не подтверждённая экономия)", "impact_updated"); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (s *Service) Reopen(ctx context.Context, u User, id, reason string, expectedVersion int) error {
	reason = strings.TrimSpace(reason)
	if len([]rune(reason)) < 10 || len([]rune(reason)) > 3000 {
		return errors.New("Опишите повторение проблемы: от 10 до 3000 символов")
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	a, err := lockAppeal(ctx, tx, id)
	if err != nil {
		return err
	}
	if u.ID != a.Author || a.Kind == "praise" {
		return ErrForbidden
	}
	if expectedVersion < 1 {
		return ErrVersionRequired
	}
	if expectedVersion != a.Version {
		return &VersionConflict{CurrentVersion: a.Version}
	}
	if a.Status != "closed" && a.Status != "resolved" {
		return ErrConflict
	}
	_, err = tx.Exec(ctx, `INSERT INTO appeal_recurrences(appeal_id,author_id,reason,previous_result,previous_effect,previous_confirmed_at) SELECT id,$2,$3,result,actual_effect,confirmed_at FROM appeals WHERE id=$1`, id, u.ID, reason)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE appeals SET status='progress',confirmed_at=NULL,actual_effect=0,result='',due_at=now()+interval '7 days',updated_at=now() WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if err = recordFeature(ctx, tx, id, u, a, "Проблема вернулась → progress. Предыдущее решение сохранено, подтверждённый эффект снят. Причина: "+reason, "appeal_reopened"); err != nil {
		return err
	}
	if a.Assignee == "" {
		_, err = tx.Exec(ctx, `INSERT INTO notifications(user_id,appeal_id,body) SELECT id,$1,'Повторная проблема без исполнителя: назначьте ответственного' FROM users WHERE role='admin' AND id<>$2`, id, u.ID)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

type PilotInput struct {
	ExpectedAppealVersion int      `json:"expected_appeal_version"`
	ID                    int64    `json:"id"`
	Version               int      `json:"version"`
	Action                string   `json:"action"`
	Hypothesis            string   `json:"hypothesis"`
	Scope                 string   `json:"scope"`
	Metric                string   `json:"metric"`
	Unit                  string   `json:"unit"`
	Baseline              float64  `json:"baseline"`
	Target                float64  `json:"target"`
	Actual                *float64 `json:"actual"`
	Direction             string   `json:"direction"`
	OwnerID               string   `json:"owner_id"`
	EndAt                 string   `json:"end_at"`
	Conclusion            string   `json:"conclusion"`
}

func (p PilotInput) ValidatePlan() error {
	if len(strings.TrimSpace(p.Hypothesis)) < 10 || len(p.Hypothesis) > 3000 || len(strings.TrimSpace(p.Scope)) < 3 || len(p.Scope) > 500 || len(strings.TrimSpace(p.Metric)) < 3 || len(p.Metric) > 200 || len(strings.TrimSpace(p.Unit)) < 1 || len(p.Unit) > 40 {
		return errors.New("Заполните изменение, участников, метрику и единицу измерения")
	}
	if !validNumber(p.Baseline, 1e9) || !validNumber(p.Target, 1e9) || !(p.Direction == "decrease" && p.Target < p.Baseline || p.Direction == "increase" && p.Target > p.Baseline) {
		return errors.New("Цель должна улучшать исходный показатель в выбранном направлении")
	}
	if _, err := time.Parse("2006-01-02", p.EndAt); err != nil {
		return errors.New("Укажите дату подведения итогов")
	}
	return nil
}
func (s *Service) SavePilot(ctx context.Context, u User, id string, in PilotInput) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	a, err := lockAppeal(ctx, tx, id)
	if err != nil {
		return err
	}
	if !manages(u, a) {
		return ErrForbidden
	}
	if in.ExpectedAppealVersion < 1 {
		return ErrVersionRequired
	}
	if in.ExpectedAppealVersion != a.Version {
		return &VersionConflict{CurrentVersion: a.Version}
	}
	if a.Kind == "praise" {
		return ErrInvalidTransition
	}
	if a.Status == "closed" || a.Status == "rejected" || a.Status == "resolved" {
		return errors.New("Создавать и менять пилот можно в открытом обращении")
	}
	var action string
	nextStatus := a.Status
	if in.Action == "create" {
		if err = in.ValidatePlan(); err != nil {
			return err
		}
		var active bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pilot_experiments WHERE appeal_id=$1 AND state<>'evaluated')`, id).Scan(&active); err != nil {
			return err
		}
		if active {
			return ErrConflict
		}
		if err = validateOwner(ctx, tx, in.OwnerID); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO pilot_experiments(appeal_id,hypothesis,scope,metric,unit,baseline,target,direction,owner_id,end_at,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text::date,'planned')`, id, in.Hypothesis, in.Scope, in.Metric, in.Unit, in.Baseline, in.Target, in.Direction, in.OwnerID, in.EndAt)
		action = "Создан паспорт пилота: " + in.Metric
	} else {
		var state, metric, unit, direction string
		var version int
		var target float64
		err = tx.QueryRow(ctx, `SELECT state,version,metric,unit,direction,target FROM pilot_experiments WHERE id=$1 AND appeal_id=$2 FOR UPDATE`, in.ID, id).Scan(&state, &version, &metric, &unit, &direction, &target)
		if err != nil {
			return err
		}
		if version != in.Version {
			return ErrConflict
		}
		switch in.Action {
		case "save":
			if state != "planned" {
				return errors.New("После запуска план пилота зафиксирован")
			}
			if err = in.ValidatePlan(); err != nil {
				return err
			}
			if err = validateOwner(ctx, tx, in.OwnerID); err != nil {
				return err
			}
			_, err = tx.Exec(ctx, `UPDATE pilot_experiments SET hypothesis=$2,scope=$3,metric=$4,unit=$5,baseline=$6,target=$7,direction=$8,owner_id=$9,end_at=$10::text::date,version=version+1 WHERE id=$1`, in.ID, in.Hypothesis, in.Scope, in.Metric, in.Unit, in.Baseline, in.Target, in.Direction, in.OwnerID, in.EndAt)
			action = "Уточнён план пилота: " + in.Metric
		case "start":
			if state != "planned" {
				return ErrConflict
			}
			_, err = tx.Exec(ctx, `UPDATE pilot_experiments SET state='running',started_at=now(),version=version+1 WHERE id=$1`, in.ID)
			nextStatus = "progress"
			action = "Пилот запущен → progress. Метрика: " + metric
		case "finish":
			if state != "running" {
				return ErrConflict
			}
			if in.Actual == nil || !validNumber(*in.Actual, 1e9) || len(strings.TrimSpace(in.Conclusion)) < 10 || len(in.Conclusion) > 3000 {
				return errors.New("Укажите фактическую метрику и вывод (от 10 символов)")
			}
			_, err = tx.Exec(ctx, `UPDATE pilot_experiments SET state='evaluated',actual=$2,conclusion=$3,evaluated_at=now(),version=version+1 WHERE id=$1`, in.ID, *in.Actual, in.Conclusion)
			met := "цель не достигнута"
			if direction == "decrease" && *in.Actual <= target || direction == "increase" && *in.Actual >= target {
				met = "цель достигнута"
			}
			action = fmt.Sprintf("Пилот завершён: %s — %g %s, %s. %s", metric, *in.Actual, unit, met, in.Conclusion)
		default:
			return errors.New("Неизвестное действие с пилотом")
		}
	}
	if err != nil {
		return err
	}
	eventType := map[string]string{"create": "pilot_planned", "save": "pilot_updated", "start": "pilot_started", "finish": "pilot_evaluated"}[in.Action]
	if _, err = tx.Exec(ctx, `UPDATE appeals SET status=$2,updated_at=now() WHERE id=$1`, id, nextStatus); err != nil {
		return err
	}
	if err = recordFeature(ctx, tx, id, u, a, action, eventType); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func validateOwner(ctx context.Context, tx pgx.Tx, id string) error {
	var role string
	if err := tx.QueryRow(ctx, `SELECT role FROM users WHERE id=$1`, id).Scan(&role); err != nil || role == "employee" {
		return errors.New("Выберите ответственного за пилот")
	}
	return nil
}

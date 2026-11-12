package service

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"time"
)

// Response time uses an actual staff comment or an explicit workflow response.
// Legacy history has no structured status and is deliberately not parsed.
const FirstResponseSQL = `(SELECT min(replied_at) FROM (
 SELECT c.created_at AS replied_at FROM comments c JOIN users u ON u.id=c.user_id
 WHERE c.appeal_id=a.id AND c.user_id<>a.author_id AND u.role IN ('executor','admin')
 UNION ALL SELECT h.created_at FROM history h JOIN users u ON u.id=h.user_id
 WHERE h.appeal_id=a.id AND h.user_id<>a.author_id AND u.role IN ('executor','admin')
 AND h.event_type<>'legacy' AND h.to_status IN ('review','progress','waiting','resolved','closed','rejected')
) responses)`

type SLA struct {
	ResponseDue       time.Time  `json:"response_due_at"`
	ResolutionDue     time.Time  `json:"resolution_due_at"`
	FirstResponse     *time.Time `json:"first_response_at"`
	LastEscalation    *time.Time `json:"last_escalation_at"`
	NextReminder      *time.Time `json:"next_reminder_at"`
	ResponseOverdue   bool       `json:"response_overdue"`
	ResolutionOverdue bool       `json:"resolution_overdue"`
	WaitingForAuthor  bool       `json:"waiting_for_author"`
	CanRemind         bool       `json:"can_remind"`
	Reason            string     `json:"reason"`
}

type queryRowSource interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func ReadSLA(ctx context.Context, q queryRowSource, id string, u User) (SLA, error) {
	var out SLA
	var author, assignee, status string
	var now time.Time
	err := q.QueryRow(ctx, `SELECT a.response_due_at,a.due_at,`+FirstResponseSQL+`,
 (SELECT max(created_at) FROM appeal_escalations WHERE appeal_id=a.id),a.author_id,coalesce(a.assignee_id,''),a.status,clock_timestamp()
 FROM appeals a WHERE a.id=$1`, id).Scan(&out.ResponseDue, &out.ResolutionDue, &out.FirstResponse, &out.LastEscalation, &author, &assignee, &status, &now)
	if err != nil {
		return out, err
	}
	active := !oneOf(status, "resolved", "closed", "rejected")
	out.WaitingForAuthor = status == "waiting"
	out.ResponseOverdue = active && !out.WaitingForAuthor && out.FirstResponse == nil && now.After(out.ResponseDue)
	out.ResolutionOverdue = active && !out.WaitingForAuthor && now.After(out.ResolutionDue)
	if out.LastEscalation != nil {
		next := out.LastEscalation.Add(24 * time.Hour)
		out.NextReminder = &next
	}
	out.CanRemind = (u.ID == author || u.Role == "admin" || u.Role == "executor" && u.ID == assignee) && (out.ResponseOverdue || out.ResolutionOverdue) && (out.NextReminder == nil || !now.Before(*out.NextReminder))
	if out.ResponseOverdue {
		out.Reason = "first_response"
	} else if out.ResolutionOverdue {
		out.Reason = "resolution"
	}
	return out, nil
}

func (s *Service) Escalate(ctx context.Context, u User, id string, expected int) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	a, err := lockAppeal(ctx, tx, id)
	if err != nil {
		return err
	}
	if u.ID != a.Author && !manages(u, a) {
		return ErrForbidden
	}
	if expected < 1 {
		return ErrVersionRequired
	}
	if expected != a.Version {
		return &VersionConflict{CurrentVersion: a.Version}
	}
	sla, err := ReadSLA(ctx, tx, id, u)
	if err != nil {
		return err
	}
	if !sla.CanRemind {
		return errors.New("Напоминание доступно после истечения срока, не чаще одного раза в 24 часа; при ожидании ответа автора оно приостановлено")
	}
	if _, err = tx.Exec(ctx, `INSERT INTO appeal_escalations(appeal_id,actor_id,reason) VALUES($1,$2,$3)`, id, u.ID, sla.Reason); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE appeals SET updated_at=now() WHERE id=$1`, id); err != nil {
		return err
	}
	if err = recordEvent(ctx, tx, id, u, "appeal_escalated", "Отправлено напоминание ответственному и администратору", "", "", map[string]any{"reason": sla.Reason, "cooldown_hours": 24}); err != nil {
		return err
	}
	// Administrators are the documented fallback escalation recipients until the
	// company configures its own reporting hierarchy. Do not infer a manager.
	_, err = tx.Exec(ctx, `INSERT INTO notifications(user_id,appeal_id,body)
 SELECT id,$1,'Эскалация: обращение просрочено, требуется внимание' FROM users
 WHERE (id=$2 OR role='admin') AND id<>$3`, id, a.Assignee, u.ID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

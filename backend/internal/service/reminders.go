package service

import (
	"context"
	"log/slog"
	"time"
)

// Reminders creates one durable reminder per overdue appeal and recipient.
func (s *Service) Reminders(ctx context.Context) {
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	for {
		queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		_, err := s.Pool.Exec(queryCtx, `INSERT INTO notifications(user_id,appeal_id,body)
   SELECT DISTINCT recipient.id,a.id,'Срок решения обращения истёк'
   FROM appeals a CROSS JOIN LATERAL unnest(ARRAY[a.author_id,a.assignee_id]) AS recipient(id)
   WHERE recipient.id IS NOT NULL AND a.due_at<now() AND a.status NOT IN ('closed','resolved','rejected')
   AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=recipient.id AND n.appeal_id=a.id AND n.body='Срок решения обращения истёк')`)
		cancel()
		if err != nil && ctx.Err() == nil {
			slog.Error("overdue reminders", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

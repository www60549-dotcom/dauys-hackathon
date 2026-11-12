package service

import (
	"context"
	"errors"
	"strings"
)

func (s *Service) Comment(ctx context.Context, user User, id, body string) error {
	body = strings.TrimSpace(body)
	if body == "" || len(body) > 10000 {
		return errors.New("Введите комментарий до 10 000 символов")
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	appeal, err := lockAppeal(ctx, tx, id)
	if err != nil {
		return err
	}
	if user.ID != appeal.Author && !manages(user, appeal) {
		return ErrForbidden
	}
	var commentID int64
	if err = tx.QueryRow(ctx, `INSERT INTO comments(appeal_id,user_id,body) VALUES($1,$2,$3) RETURNING id`, id, user.ID, body).Scan(&commentID); err != nil {
		return err
	}
	if err = recordEvent(ctx, tx, id, user, "comment_added", "Добавлен комментарий", "", "", map[string]any{"comment_id": commentID}); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO notifications(user_id,appeal_id,body) SELECT DISTINCT x,$1,'Новый комментарий в обращении' FROM unnest(ARRAY[$2,$3]) x WHERE x<>'' AND x<>$4`, id, appeal.Author, appeal.Assignee, user.ID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

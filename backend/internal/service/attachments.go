package service

import "context"

func (s *Service) AddAttachment(ctx context.Context, user User, appealID, fileID, name string, size int64) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	appeal, err := lockAppeal(ctx, tx, appealID)
	if err != nil {
		return err
	}
	if user.ID != appeal.Author && !manages(user, appeal) {
		return ErrForbidden
	}
	_, err = tx.Exec(ctx, `INSERT INTO attachments(id,appeal_id,name,size,content_type) VALUES($1,$2,$3,$4,'application/octet-stream')`, fileID, appealID, name, size)
	if err != nil {
		return err
	}
	if err = recordEvent(ctx, tx, appealID, user, "attachment_added", "Добавлено вложение", "", "", map[string]any{"file_id": fileID, "name": name}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

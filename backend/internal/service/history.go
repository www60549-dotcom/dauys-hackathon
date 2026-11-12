package service

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
)

func recordEvent(ctx context.Context, tx pgx.Tx, id string, user User, eventType, action, fromStatus, toStatus string, details map[string]any) error {
	if details == nil {
		details = map[string]any{}
	}
	encoded, err := json.Marshal(details)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO history(appeal_id,user_id,action,event_type,from_status,to_status,appeal_version,details,created_at)
VALUES($1,$2,$3,$4,nullif($5,''),nullif($6,''),(SELECT version FROM appeals WHERE id=$1),$7::jsonb,clock_timestamp())`, id, user.ID, action, eventType, fromStatus, toStatus, encoded)
	return err
}

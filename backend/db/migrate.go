package schema

import (
	"context"
	"embed"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql migrations/*.sql
var files embed.FS

// Migrate uses one source of SQL for runtime, sqlc and migration verification.
// All pending migrations commit together under the existing deployment lock.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(716203)`); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	for _, migration := range []struct {
		version int
		path    string
	}{{1, "schema.sql"}, {2, "migrations/002.sql"}, {3, "migrations/003_workflow.sql"}} {
		var exists bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1)`, migration.version).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
		sql, readErr := files.ReadFile(migration.path)
		if readErr != nil {
			return readErr
		}
		if _, err = tx.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("migration %d: %w", migration.version, err)
		}
		if _, err = tx.Exec(ctx, `INSERT INTO schema_migrations(version) VALUES($1)`, migration.version); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

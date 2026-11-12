package schema

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestMigrationReapplyPreservesExistingRecords(t *testing.T) {
	dsn := os.Getenv("DAUYS_MIGRATION_TEST_URL")
	if dsn == "" {
		t.Skip("set DAUYS_MIGRATION_TEST_URL to an isolated dauys_workflow_ database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var name string
	if err = pool.QueryRow(ctx, `SELECT current_database()`).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(name, "dauys_workflow_") {
		t.Fatal("migration test refuses to touch a non-test database")
	}
	snapshot := func() string {
		var state string
		err := pool.QueryRow(ctx, `SELECT json_build_object(
 'appeals',(SELECT coalesce(md5(string_agg(row_to_json(a)::text,E'\n' ORDER BY id)),'') FROM appeals a),
 'history',(SELECT coalesce(md5(string_agg(row_to_json(h)::text,E'\n' ORDER BY id)),'') FROM history h),
 'migrations',(SELECT count(*) FROM schema_migrations))::text`).Scan(&state)
		if err != nil {
			t.Fatal(err)
		}
		return state
	}
	before := snapshot()
	for range 2 {
		if err = Migrate(ctx, pool); err != nil {
			t.Fatal(err)
		}
	}
	if after := snapshot(); after != before {
		t.Fatalf("reapplying migrations changed existing data: before %s, after %s", before, after)
	}
}

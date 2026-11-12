package service

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestHistoryTimestampIsNotBackdatedToTransactionStart(t *testing.T) {
	dsn := os.Getenv("DAUYS_MIGRATION_TEST_URL")
	if dsn == "" {
		t.Skip("requires isolated workflow test database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var database string
	if err = pool.QueryRow(ctx, `SELECT current_database()`).Scan(&database); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(database, "dauys_workflow_") {
		t.Fatal("history test refuses a non-test database")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var id, author string
	if err = tx.QueryRow(ctx, `SELECT id,author_id FROM appeals ORDER BY id LIMIT 1`).Scan(&id, &author); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `SELECT pg_sleep(0.04)`); err != nil {
		t.Fatal(err)
	}
	if err = recordEvent(ctx, tx, id, User{ID: author}, "verification", "Timestamp verification", "", "", nil); err != nil {
		t.Fatal(err)
	}
	var actualTime bool
	if err = tx.QueryRow(ctx, `SELECT created_at>transaction_timestamp()+interval '20 milliseconds' FROM history WHERE appeal_id=$1 AND event_type='verification' ORDER BY id DESC LIMIT 1`, id).Scan(&actualTime); err != nil {
		t.Fatal(err)
	}
	if !actualTime {
		t.Fatal("audit event was backdated while waiting in a transaction")
	}
}

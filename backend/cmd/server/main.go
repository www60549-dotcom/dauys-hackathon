package main

import (
	"context"
	"dauys/internal/db"
	"dauys/internal/httpapi"
	"dauys/internal/service"
	"embed"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"
)

//go:embed schema.sql seed.json migration_002.sql
var assets embed.FS

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://dauys@127.0.0.1:55432/dauys?sslmode=disable"
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		panic(err)
	}
	cfg.MaxConns = 12
	cfg.MinConns = 1
	cfg.MaxConnIdleTime = 5 * time.Minute
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		panic(err)
	}
	defer pool.Close()
	if err = pool.Ping(ctx); err != nil {
		panic(err)
	}
	if err = migrate(ctx, pool); err != nil {
		panic(err)
	}
	if err = seed(ctx, pool); err != nil {
		panic(err)
	}
	uploads := os.Getenv("UPLOAD_DIR")
	if uploads == "" {
		uploads = "data/uploads"
	}
	api := &httpapi.API{Svc: &service.Service{Pool: pool}, DB: db.New(pool), Uploads: uploads, Secure: os.Getenv("COOKIE_SECURE") == "true"}
	reminderCtx, stopReminders := context.WithCancel(context.Background())
	defer stopReminders()
	go api.Svc.Reminders(reminderCtx)
	app := api.App()
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	go func() {
		slog.Info("API ready", "port", port)
		if err := app.Listen(net.JoinHostPort(os.Getenv("HOST"), port)); err != nil {
			slog.Error("listen", "error", err)
		}
	}()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	slog.Info("shutting down")
	_ = app.ShutdownWithTimeout(10 * time.Second)
}
func migrate(ctx context.Context, pool *pgxpool.Pool) error {
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
	var exists bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=1)`).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		schema, _ := assets.ReadFile("schema.sql")
		if _, err = tx.Exec(ctx, string(schema)); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO schema_migrations(version) VALUES(1)`); err != nil {
			return err
		}
	}
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=2)`).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		migration, readErr := assets.ReadFile("migration_002.sql")
		if readErr != nil {
			return readErr
		}
		if _, err = tx.Exec(ctx, string(migration)); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO schema_migrations(version) VALUES(2)`); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

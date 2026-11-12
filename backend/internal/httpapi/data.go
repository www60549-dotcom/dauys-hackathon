package httpapi

import (
	"context"
	"dauys/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"time"
)

func timestamp(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t, Valid: true} }
func (a *API) maps(ctx context.Context, sql string, args ...any) ([]map[string]any, error) {
	rows, err := a.Svc.Pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		values, e := rows.Values()
		if e != nil {
			return nil, e
		}
		m := map[string]any{}
		for i, f := range rows.FieldDescriptions() {
			m[f.Name] = values[i]
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
func (a *API) analytics(c *fiber.Ctx) error {
	ctx, cancel := service.Context()
	defer cancel()
	summary, err := a.maps(ctx, `SELECT count(*)::int AS total,count(*) FILTER(WHERE status IN ('closed','resolved'))::int AS resolved,count(*) FILTER(WHERE status='waiting')::int AS waiting,count(*) FILTER(WHERE due_at<now() AND status NOT IN ('closed','resolved','rejected'))::int AS overdue,coalesce(sum(actual_effect) FILTER(WHERE confirmed_at IS NOT NULL),0)::int AS confirmed_effect,coalesce(sum(expected_effect),0)::int AS expected_effect,coalesce(round(avg(EXTRACT(EPOCH FROM (updated_at-created_at))/86400) FILTER(WHERE status IN ('resolved','closed'))::numeric,1),0)::float8 AS average_days FROM appeals`)
	if err != nil {
		return err
	}
	departments, err := a.maps(ctx, `SELECT department,count(*)::int AS total,count(*) FILTER(WHERE status IN ('closed','resolved'))::int AS resolved,count(*) FILTER(WHERE priority='critical' AND status NOT IN ('closed','resolved','rejected'))::int AS critical,count(*) FILTER(WHERE due_at<now() AND status NOT IN ('closed','resolved','rejected'))::int AS overdue FROM appeals GROUP BY department ORDER BY department`)
	if err != nil {
		return err
	}
	types, err := a.maps(ctx, `SELECT kind,count(*)::int AS total FROM appeals GROUP BY kind`)
	if err != nil {
		return err
	}
	trend, err := a.maps(ctx, `SELECT to_char(d,'DD.MM') AS day,(SELECT count(*)::int FROM appeals WHERE created_at::date=d::date) AS total FROM generate_series(current_date-6,current_date,'1 day') d`)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"summary": summary[0], "departments": departments, "types": types, "trend": trend})
}

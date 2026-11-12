package httpapi

import (
	"dauys/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"time"
)

func (a *API) dashboard(c *fiber.Ctx) error {
	ctx, cancel := service.Context()
	defer cancel()
	tx, err := a.Svc.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	read := func(sql string, args ...any) ([]map[string]any, error) { return mapsFrom(ctx, tx, sql, args...) }
	zone, err := time.LoadLocation("Asia/Qyzylorda")
	if err != nil {
		zone = time.FixedZone("Qyzylorda", 5*3600)
	}
	start := time.Date(1970, 1, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(9999, 1, 1, 0, 0, 0, 0, time.UTC)
	now := time.Now().In(zone)
	chartEnd := time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, zone)
	if month := c.Query("month"); month != "" {
		var err error
		start, err = time.ParseInLocation("2006-01", month, zone)
		if err != nil {
			return fail(c, 400, "Некорректный период")
		}
		end = start.AddDate(0, 1, 0)
		chartEnd = end
	}
	args := []any{c.Query("department"), start, end}
	const scope = `WITH scope AS (SELECT id,title,description,category,department,status,priority,kind,author_id,parent_id,affected,expected_effect,actual_effect,created_at,updated_at,due_at,confirmed_at FROM appeals WHERE ($1='' OR department=$1) AND created_at>=$2 AND created_at<$3) `
	summary, err := read(scope+`SELECT count(*)::int AS total,count(*) FILTER(WHERE status='closed')::int AS closed,coalesce(round(100.0*count(*) FILTER(WHERE status='closed')/nullif(count(*),0),1),0)::float8 AS closed_percent,count(*) FILTER(WHERE status IN ('closed','resolved'))::int AS resolved,count(*) FILTER(WHERE status='waiting')::int AS waiting,count(*) FILTER(WHERE due_at<now() AND status NOT IN ('closed','resolved','rejected'))::int AS overdue,coalesce(sum(actual_effect) FILTER(WHERE confirmed_at IS NOT NULL),0)::bigint AS confirmed_effect,coalesce(sum(expected_effect),0)::bigint AS expected_effect,coalesce(round(avg(EXTRACT(EPOCH FROM (updated_at-created_at))/86400) FILTER(WHERE status IN ('resolved','closed'))::numeric,1),0)::float8 AS average_days,round(avg(EXTRACT(EPOCH FROM ((SELECT min(c.created_at) FROM comments c WHERE c.appeal_id=scope.id AND c.user_id<>scope.author_id)-created_at))/3600)::numeric,1)::float8 AS first_response_hours,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM comments c WHERE c.appeal_id=scope.id AND c.user_id<>scope.author_id))::int AS first_response_count,count(*) FILTER(WHERE confirmed_at IS NOT NULL AND kind='idea')::int AS implemented FROM scope`, args...)
	if err != nil {
		return err
	}
	types, err := read(scope+`SELECT k.kind,count(s.id)::int AS total FROM (VALUES ('problem'),('idea'),('praise')) k(kind) LEFT JOIN scope s ON s.kind=k.kind GROUP BY k.kind ORDER BY k.kind`, args...)
	if err != nil {
		return err
	}
	depts, err := read(scope+`SELECT department,count(*)::int AS total,count(*) FILTER(WHERE status IN ('resolved','closed'))::int AS resolved,count(*) FILTER(WHERE priority='critical' AND status NOT IN ('resolved','closed','rejected'))::int AS critical,count(*) FILTER(WHERE due_at<now() AND status NOT IN ('resolved','closed','rejected'))::int AS overdue FROM scope GROUP BY department ORDER BY count(*) DESC,department`, args...)
	if err != nil {
		return err
	}
	eventSummary, err := read(`SELECT
 (SELECT count(DISTINCT h.appeal_id)::int FROM history h JOIN appeals a ON a.id=h.appeal_id WHERE ($1='' OR a.department=$1) AND a.kind<>'praise' AND h.event_type<>'legacy' AND h.to_status='resolved' AND h.created_at>=$2 AND h.created_at<$3) AS resolved,
 (SELECT coalesce(sum(actual_effect),0)::bigint FROM appeals WHERE ($1='' OR department=$1) AND kind<>'praise' AND confirmed_at>=$2 AND confirmed_at<$3) AS confirmed_effect,
 (SELECT count(*)::int FROM appeals WHERE ($1='' OR department=$1) AND kind='idea' AND confirmed_at>=$2 AND confirmed_at<$3) AS implemented,
 (SELECT count(*)::int FROM appeals a WHERE ($1='' OR department=$1) AND status IN ('resolved','closed') AND kind<>'praise' AND NOT EXISTS(SELECT 1 FROM history h WHERE h.appeal_id=a.id AND h.event_type<>'legacy' AND h.to_status='resolved')) AS undated_legacy_resolutions`, args...)
	if err != nil {
		return err
	}
	for key, value := range eventSummary[0] {
		summary[0][key] = value
	}
	responseSummary, err := read(`SELECT round(avg(EXTRACT(EPOCH FROM (reply-created_at))/3600)::numeric,1)::float8 AS first_response_hours,count(reply)::int AS first_response_count FROM (SELECT a.created_at,`+service.FirstResponseSQL+` AS reply FROM appeals a WHERE ($1='' OR a.department=$1) AND a.created_at>=$2 AND a.created_at<$3) replies`, args...)
	if err != nil {
		return err
	}
	for key, value := range responseSummary[0] {
		summary[0][key] = value
	}
	trend, err := read(`WITH months AS (SELECT d FROM generate_series(($2::timestamptz AT TIME ZONE 'Asia/Qyzylorda')-interval '12 months',($2::timestamptz AT TIME ZONE 'Asia/Qyzylorda')-interval '1 month',interval '1 month') d)
 SELECT to_char(d,'YYYY-MM') AS month,
 (SELECT count(*)::int FROM appeals a WHERE ($1='' OR a.department=$1) AND a.created_at>=(d AT TIME ZONE 'Asia/Qyzylorda') AND a.created_at<((d+interval '1 month') AT TIME ZONE 'Asia/Qyzylorda')) AS total,
 (SELECT count(DISTINCT h.appeal_id)::int FROM history h JOIN appeals a ON a.id=h.appeal_id WHERE ($1='' OR a.department=$1) AND a.kind<>'praise' AND h.event_type<>'legacy' AND h.to_status='resolved' AND h.created_at>=(d AT TIME ZONE 'Asia/Qyzylorda') AND h.created_at<((d+interval '1 month') AT TIME ZONE 'Asia/Qyzylorda')) AS resolved
 FROM months ORDER BY d`, c.Query("department"), chartEnd)
	if err != nil {
		return err
	}
	const score = `CASE WHEN status IN ('resolved','closed','rejected') THEN 0 ELSE affected*3+EXTRACT(DAY FROM now()-created_at)::int*2+CASE priority WHEN 'critical' THEN 1000 WHEN 'high' THEN 35 ELSE 0 END END`
	heatmap, err := read(scope+`SELECT department,CASE WHEN title||' '||description||' '||category ILIKE '%инструк%' THEN 'Инструкции' WHEN title||' '||description||' '||category ILIKE '%доступ%' THEN 'Доступ' ELSE 'Сроки' END AS topic,coalesce(max(`+score+`),0)::int AS score,count(*)::int AS total FROM scope WHERE kind='problem' GROUP BY department,topic`, args...)
	if err != nil {
		return err
	}
	recurring, err := read(scope+`SELECT g.id,p.title,g.affected,g.score,g.total FROM (SELECT coalesce(parent_id,id) AS id,sum(affected)::int AS affected,max(`+score+`)::int AS score,count(*)::int AS total FROM scope WHERE kind='problem' GROUP BY coalesce(parent_id,id) HAVING count(*)>1 OR bool_or(parent_id IS NOT NULL)) g JOIN appeals p ON p.id=g.id ORDER BY g.score DESC LIMIT 10`, args...)
	if err != nil {
		return err
	}
	top, err := read(scope+`SELECT s.id,s.title,(SELECT count(*)::int FROM votes WHERE appeal_id=s.id) AS votes FROM scope s WHERE kind='idea' ORDER BY votes DESC,s.created_at DESC LIMIT 1`, args...)
	if err != nil {
		return err
	}
	var topIdea any
	if len(top) > 0 {
		topIdea = top[0]
	}
	impactSummary, err := read(scope+`SELECT count(i.appeal_id)::int AS assessed_topics,coalesce(round(sum(i.people*i.minutes*i.occurrences_month/60)::numeric,1),0)::float8 AS hours_month,coalesce(round(sum(i.people*i.minutes*i.occurrences_month/60*i.hourly_rate)::numeric,0),0)::float8 AS cost_month FROM scope s LEFT JOIN appeal_impact i ON i.appeal_id=s.id WHERE s.parent_id IS NULL AND s.status NOT IN ('resolved','closed','rejected')`, args...)
	if err != nil {
		return err
	}
	topLoss, err := read(scope+`SELECT s.id,s.title,s.department,round((i.people*i.minutes*i.occurrences_month/60)::numeric,1)::float8 AS hours_month,round((i.people*i.minutes*i.occurrences_month/60*i.hourly_rate)::numeric,0)::float8 AS cost_month FROM scope s JOIN appeal_impact i ON i.appeal_id=s.id WHERE s.parent_id IS NULL AND s.status NOT IN ('resolved','closed','rejected') ORDER BY i.people*i.minutes*i.occurrences_month DESC,s.id LIMIT 3`, args...)
	if err != nil {
		return err
	}
	pilotSummary, err := read(scope+`SELECT count(*) FILTER(WHERE p.state='running')::int AS running,count(*) FILTER(WHERE p.state='evaluated')::int AS evaluated,count(*) FILTER(WHERE p.state='evaluated' AND (p.direction='decrease' AND p.actual<=p.target OR p.direction='increase' AND p.actual>=p.target))::int AS goals_met FROM pilot_experiments p JOIN scope s ON s.id=p.appeal_id`, args...)
	if err != nil {
		return err
	}
	repeatSummary, err := read(scope+`SELECT count(DISTINCT r.appeal_id)::int AS appeals,count(r.id)::int AS events FROM appeal_recurrences r JOIN scope s ON s.id=r.appeal_id`, args...)
	if err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"trend_basis": "resolution_events", "timezone": "Asia/Qyzylorda", "summary": summary[0], "departments": depts, "types": types, "trend": trend, "heatmap": heatmap, "recurring": recurring, "top_idea": topIdea, "insights": fiber.Map{"impact": impactSummary[0], "top_loss": topLoss, "pilots": pilotSummary[0], "recurrences": repeatSummary[0]}})
}

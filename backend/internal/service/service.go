package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Email      string `json:"email"`
	Role       string `json:"role"`
	Department string `json:"department"`
}
type Appeal struct {
	Impact          *ImpactInput `json:"impact,omitempty"`
	RecurrenceCount int          `json:"recurrence_count"`
	ID              string       `json:"id"`
	Title           string       `json:"title"`
	Description     string       `json:"description"`
	Solution        string       `json:"solution"`
	Kind            string       `json:"kind"`
	Category        string       `json:"category"`
	Department      string       `json:"department"`
	Priority        string       `json:"priority"`
	Status          string       `json:"status"`
	AuthorID        string       `json:"author_id"`
	Author          string       `json:"author"`
	AssigneeID      string       `json:"assignee_id"`
	Assignee        string       `json:"assignee"`
	ParentID        string       `json:"parent_id"`
	Affected        int          `json:"affected"`
	ExpectedEffect  int          `json:"expected_effect"`
	ActualEffect    int          `json:"actual_effect"`
	Result          string       `json:"result"`
	DueAt           time.Time    `json:"due_at"`
	CreatedAt       time.Time    `json:"created_at"`
	UpdatedAt       time.Time    `json:"updated_at"`
	Confirmed       bool         `json:"confirmed"`
	Votes           int          `json:"votes"`
	Voted           bool         `json:"voted"`
	Score           int          `json:"score"`
}
type Service struct{ Pool *pgxpool.Pool }

func ID(prefix string) string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return prefix + hex.EncodeToString(b)
}
func Context() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 5*time.Second)
}

const cols = `a.id,a.title,a.description,a.solution,a.kind,a.category,a.department,a.priority,a.status,a.author_id,u.name,coalesce(a.assignee_id,''),coalesce(e.name,'Не назначен'),coalesce(a.parent_id,''),a.affected,a.expected_effect,a.actual_effect,a.result,a.due_at,a.created_at,a.updated_at,a.confirmed_at IS NOT NULL,(SELECT count(*) FROM votes v WHERE v.appeal_id=a.id),EXISTS(SELECT 1 FROM votes v WHERE v.appeal_id=a.id AND v.user_id=$1),(SELECT count(*) FROM appeal_recurrences r WHERE r.appeal_id=a.id)`
const joins = ` FROM appeals a JOIN users u ON u.id=a.author_id LEFT JOIN users e ON e.id=a.assignee_id `

func scan(row pgx.Row) (Appeal, error) {
	var a Appeal
	err := row.Scan(&a.ID, &a.Title, &a.Description, &a.Solution, &a.Kind, &a.Category, &a.Department, &a.Priority, &a.Status, &a.AuthorID, &a.Author, &a.AssigneeID, &a.Assignee, &a.ParentID, &a.Affected, &a.ExpectedEffect, &a.ActualEffect, &a.Result, &a.DueAt, &a.CreatedAt, &a.UpdatedAt, &a.Confirmed, &a.Votes, &a.Voted, &a.RecurrenceCount)
	age := int(time.Since(a.CreatedAt).Hours() / 24)
	a.Score = a.Affected*3 + age*2 + a.RecurrenceCount*25
	if a.Priority == "high" {
		a.Score += 35
	}
	if a.Priority == "critical" {
		a.Score += 1000
	}
	if a.Status == "closed" || a.Status == "resolved" || a.Status == "rejected" {
		a.Score = 0
	}
	return a, err
}
func (s *Service) Get(ctx context.Context, user, id string) (Appeal, error) {
	return scan(s.Pool.QueryRow(ctx, `SELECT `+cols+joins+` WHERE a.id=$2`, user, id))
}

type Filter struct {
	Q, Status, Category, Department, Mine, Sort, Month string
	Kind, DueFrom, DueTo, CreatedMonth                 string
	Page                                               int
	Overdue                                            bool
	Unassigned                                         bool
	Assigned                                           bool
}

const filterWhere = ` WHERE ($2='' OR a.title ILIKE '%'||$2||'%' OR a.description ILIKE '%'||$2||'%' OR a.id ILIKE '%'||$2||'%') AND ($3='' OR a.status=$3 OR ($3='resolved' AND a.status='closed') OR ($3='active' AND a.status NOT IN ('closed','rejected')) OR ($3='done' AND a.status IN ('resolved','closed') AND a.kind<>'praise')) AND ($4='' OR a.category=$4) AND ($5='' OR a.department=$5) AND ($6<>'true' OR a.author_id=$1) AND (NOT $7 OR (a.due_at<now() AND a.status NOT IN ('closed','resolved','rejected'))) AND ($8='' OR to_char(a.updated_at,'YYYY-MM')=$8) AND ($9='' OR a.kind=$9) AND ($10='' OR a.due_at>=(nullif($10,'')::date::timestamp AT TIME ZONE 'Asia/Qyzylorda')) AND ($11='' OR a.due_at<((nullif($11,'')::date+1)::timestamp AT TIME ZONE 'Asia/Qyzylorda')) AND (NOT $12 OR a.assignee_id IS NULL) AND ($13='' OR (a.created_at>=(nullif($13,'')||'-01')::date::timestamp AT TIME ZONE 'UTC' AND a.created_at<((nullif($13,'')||'-01')::date+interval '1 month')::timestamp AT TIME ZONE 'UTC')) AND (NOT $14 OR a.assignee_id=$1)`

var ErrInvalidFilter = errors.New("Некорректный фильтр")

func filterArgs(u User, f Filter) ([]any, error) {
	for _, month := range []string{f.Month, f.CreatedMonth} {
		if month != "" {
			if _, err := time.Parse("2006-01", month); err != nil {
				return nil, fmt.Errorf("%w: период", ErrInvalidFilter)
			}
		}
	}
	if !oneOf(f.Kind, "", "problem", "idea", "praise") {
		return nil, fmt.Errorf("%w: тип обращения", ErrInvalidFilter)
	}
	for _, date := range []string{f.DueFrom, f.DueTo} {
		if date != "" {
			if _, err := time.Parse("2006-01-02", date); err != nil {
				return nil, fmt.Errorf("%w: срок должен быть в формате ГГГГ-ММ-ДД", ErrInvalidFilter)
			}
		}
	}
	if f.DueFrom != "" && f.DueTo != "" && f.DueFrom > f.DueTo {
		return nil, fmt.Errorf("%w: начало периода срока должно быть не позже окончания", ErrInvalidFilter)
	}
	return []any{u.ID, f.Q, f.Status, f.Category, f.Department, f.Mine, f.Overdue, f.Month, f.Kind, f.DueFrom, f.DueTo, f.Unassigned, f.CreatedMonth, f.Assigned}, nil
}

func (s *Service) Counts(ctx context.Context, u User, f Filter) (map[string]int, error) {
	f.Status = ""
	args, err := filterArgs(u, f)
	if err != nil {
		return nil, err
	}
	var total, progress, waiting, resolved, active int
	err = s.Pool.QueryRow(ctx, `SELECT count(*)::int,count(*) FILTER(WHERE status='progress')::int,count(*) FILTER(WHERE status='waiting')::int,count(*) FILTER(WHERE status IN ('resolved','closed'))::int,count(*) FILTER(WHERE status NOT IN ('closed','rejected'))::int`+joins+filterWhere, args...).Scan(&total, &progress, &waiting, &resolved, &active)
	return map[string]int{"total": total, "active": active, "progress": progress, "waiting": waiting, "resolved": resolved}, err
}

func (s *Service) List(ctx context.Context, u User, f Filter) ([]Appeal, int, error) {
	if f.Page < 1 {
		f.Page = 1
	}
	args, err := filterArgs(u, f)
	if err != nil {
		return nil, 0, err
	}
	var count int
	if err := s.Pool.QueryRow(ctx, `SELECT count(*)`+joins+filterWhere, args...).Scan(&count); err != nil {
		return nil, 0, err
	}
	order := `a.created_at DESC,a.id`
	if f.Sort == "updated" {
		order = `a.updated_at DESC,a.created_at DESC,a.id`
	} else if f.Sort == "votes" {
		order = `23 DESC,a.created_at DESC`
	} else if f.Sort == "priority" {
		order = `CASE WHEN a.status IN ('closed','resolved','rejected') THEN 0 ELSE CASE a.priority WHEN 'critical' THEN 1000 WHEN 'high' THEN 35 ELSE 0 END+a.affected*3+EXTRACT(EPOCH FROM (now()-a.created_at))/43200+(SELECT count(*)*25 FROM appeal_recurrences r WHERE r.appeal_id=a.id) END DESC`
	}
	args = append(args, 30, (f.Page-1)*30)
	rows, err := s.Pool.Query(ctx, `SELECT `+cols+joins+filterWhere+` ORDER BY `+order+` LIMIT $15 OFFSET $16`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Appeal{}
	for rows.Next() {
		a, e := scan(rows)
		if e != nil {
			return nil, 0, e
		}
		out = append(out, a)
	}
	return out, count, rows.Err()
}
func (s *Service) Create(ctx context.Context, u User, a Appeal) (string, error) {
	a.Title = strings.TrimSpace(a.Title)
	a.Description = strings.TrimSpace(a.Description)
	if len([]rune(a.Title)) < 5 || len([]rune(a.Title)) > 180 || len([]rune(a.Description)) < 10 || len(a.Description) > 20000 || len(a.Solution) > 10000 {
		return "", errors.New("Укажите заголовок (5–180 символов) и описание (от 10 символов)")
	}
	if !oneOf(a.Kind, "problem", "idea", "praise") || !oneOf(a.Priority, "low", "medium", "high", "critical") || !oneOf(a.Department, "Закупки", "Проектирование", "Бухгалтерия", "Продажи", "IT", "Офис", "Монтаж и сервис") {
		return "", errors.New("Проверьте тип, приоритет и подразделение")
	}
	if a.Affected < 1 || a.Affected > 100000 || a.ExpectedEffect < 0 || a.ExpectedEffect > 1000000000 {
		return "", errors.New("Некорректная оценка эффекта")
	}
	if a.Impact != nil {
		if err := a.Impact.Validate(); err != nil {
			return "", err
		}
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var assignee *string
	if err = tx.QueryRow(ctx, `SELECT assignee_id FROM categories WHERE name=$1`, a.Category).Scan(&assignee); err != nil {
		return "", errors.New("Выберите категорию")
	}
	id := ID("A-")
	_, err = tx.Exec(ctx, `INSERT INTO appeals(id,title,description,solution,kind,category,department,priority,author_id,assignee_id,affected,expected_effect,due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()+interval '7 days')`, id, a.Title, a.Description, a.Solution, a.Kind, a.Category, a.Department, a.Priority, u.ID, assignee, a.Affected, a.ExpectedEffect)
	if err != nil {
		return "", err
	}
	_, err = tx.Exec(ctx, `INSERT INTO history(appeal_id,user_id,action) VALUES($1,$2,'Обращение зарегистрировано и направлено по категории')`, id, u.ID)
	if err != nil {
		return "", err
	}
	if assignee != nil {
		_, err = tx.Exec(ctx, `INSERT INTO notifications(user_id,appeal_id,body) VALUES($1,$2,'Вам назначено новое обращение')`, *assignee, id)
		if err != nil {
			return "", err
		}
	} else {
		_, err = tx.Exec(ctx, `INSERT INTO notifications(user_id,appeal_id,body) SELECT id,$1,'Новое обращение без исполнителя — назначьте ответственного' FROM users WHERE role='admin'`, id)
		if err != nil {
			return "", err
		}
	}
	if a.Impact != nil {
		if err = SaveImpactTx(ctx, tx, id, *a.Impact); err != nil {
			return "", err
		}
	}
	return id, tx.Commit(ctx)
}
func oneOf(v string, all ...string) bool {
	for _, x := range all {
		if v == x {
			return true
		}
	}
	return false
}
func (s *Service) Update(ctx context.Context, u User, id string, in Appeal) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var author, assignee, status, kind string
	err = tx.QueryRow(ctx, `SELECT author_id,coalesce(assignee_id,''),status,kind FROM appeals WHERE id=$1 FOR UPDATE`, id).Scan(&author, &assignee, &status, &kind)
	if err != nil {
		return err
	}
	handler := u.Role == "admin" || (u.Role == "executor" && assignee == u.ID)
	notificationAssignee := assignee
	action := "Обращение обновлено"
	if in.Status == "closed" && u.ID == author && status == "resolved" {
		_, err = tx.Exec(ctx, `UPDATE appeals SET status='closed',confirmed_at=now(),updated_at=now() WHERE id=$1`, id)
		action = "Автор подтвердил решение"
	} else if handler {
		if !(oneOf(in.Status, "new", "review", "progress", "waiting", "resolved", "rejected") || (kind == "praise" && in.Status == "closed")) || !oneOf(in.Priority, "low", "medium", "high", "critical") {
			return errors.New("Некорректный статус или приоритет")
		}
		if in.Status == "resolved" || in.Status == "rejected" {
			var pilotActive bool
			if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pilot_experiments WHERE appeal_id=$1 AND state IN ('planned','running'))`, id).Scan(&pilotActive); err != nil {
				return err
			}
			if pilotActive {
				return errors.New("Сначала подведите итоги активного пилота, затем зафиксируйте решение обращения")
			}
		}
		if (in.Status == "resolved" || in.Status == "rejected") && len(strings.TrimSpace(in.Result)) < 10 {
			return errors.New("Опишите решение или причину отказа (от 10 символов)")
		}
		if in.ActualEffect < 0 || in.ActualEffect > 1000000000 {
			return errors.New("Некорректный эффект")
		}
		if in.AssigneeID != "" {
			var role string
			if e := tx.QueryRow(ctx, `SELECT role FROM users WHERE id=$1`, in.AssigneeID).Scan(&role); e != nil || role == "employee" {
				return errors.New("Выберите исполнителя")
			}
		}
		if in.ParentID != "" {
			if in.ParentID == id {
				return errors.New("Нельзя связать обращение с самим собой")
			}
			var parent *string
			if e := tx.QueryRow(ctx, `SELECT parent_id FROM appeals WHERE id=$1 FOR UPDATE`, in.ParentID).Scan(&parent); e != nil || parent != nil {
				return errors.New("Выберите самостоятельную тему")
			}
			var children int
			_ = tx.QueryRow(ctx, `SELECT count(*) FROM appeals WHERE parent_id=$1`, id).Scan(&children)
			if children > 0 {
				return errors.New("Тема уже содержит связанные обращения")
			}
		}
		if in.DueAt.IsZero() {
			return errors.New("Укажите срок")
		}
		_, err = tx.Exec(ctx, `UPDATE appeals SET status=$2,priority=$3,assignee_id=nullif($4,''),parent_id=nullif($5,''),result=$6,actual_effect=$7,due_at=$8,confirmed_at=NULL,updated_at=now() WHERE id=$1`, id, in.Status, in.Priority, in.AssigneeID, in.ParentID, in.Result, in.ActualEffect, in.DueAt)
		notificationAssignee = in.AssigneeID
		action = fmt.Sprintf("Статус: %s → %s. Обновлены ответственный, срок и решение", status, in.Status)
	} else if u.ID == author && oneOf(status, "new", "waiting") {
		if len([]rune(in.Title)) < 5 || len([]rune(in.Title)) > 180 || len([]rune(in.Description)) < 10 || len(in.Description) > 20000 || len(in.Solution) > 10000 {
			return errors.New("Проверьте заголовок и описание")
		}
		_, err = tx.Exec(ctx, `UPDATE appeals SET title=$2,description=$3,solution=$4,updated_at=now() WHERE id=$1`, id, in.Title, in.Description, in.Solution)
	} else {
		return errors.New("Нет прав на изменение обращения")
	}
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO history(appeal_id,user_id,action) VALUES($1,$2,$3)`, id, u.ID, action)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO notifications(user_id,appeal_id,body) SELECT DISTINCT x,$1,$2 FROM unnest(ARRAY[$3,$4,$5]) AS x WHERE x<>'' AND x<>$6`, id, action, author, assignee, notificationAssignee, u.ID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

package httpapi

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"dauys/internal/db"
	"dauys/internal/service"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"golang.org/x/crypto/bcrypt"
)

type API struct {
	Svc     *service.Service
	DB      *db.Queries
	Uploads string
	Secure  bool
}

func hash(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func fail(c *fiber.Ctx, status int, msg string) error {
	return c.Status(status).JSON(fiber.Map{"error": msg})
}
func user(c *fiber.Ctx) service.User { return c.Locals("user").(service.User) }
func (a *API) App() *fiber.App {
	app := fiber.New(fiber.Config{BodyLimit: 12 * 1024 * 1024, ReadTimeout: 15 * time.Second, IdleTimeout: 75 * time.Second, DisableStartupMessage: true, ErrorHandler: func(c *fiber.Ctx, err error) error {
		code := 500
		msg := "Не удалось выполнить запрос"
		if e, ok := err.(*fiber.Error); ok {
			code = e.Code
			msg = e.Message
		}
		slog.Error("http error", "method", c.Method(), "path", c.Path(), "error", err)
		return fail(c, code, msg)
	}})
	app.Use(recover.New())
	app.Use(func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("Cache-Control", "no-store")
		if c.Method() != "GET" && c.Method() != "HEAD" {
			origin := c.Get("Origin")
			allowed := os.Getenv("APP_ORIGINS")
			if allowed == "" {
				allowed = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5175,http://127.0.0.1:5175,http://localhost:3000,http://127.0.0.1:3000"
			}
			valid := origin == ""
			for _, o := range strings.Split(allowed, ",") {
				if origin == o {
					valid = true
				}
			}
			if !valid {
				return fail(c, 403, "Недопустимый источник запроса")
			}
		}
		return c.Next()
	})
	app.Get("/api/health", func(c *fiber.Ctx) error {
		ctx, cancel := service.Context()
		defer cancel()
		if err := a.Svc.Pool.Ping(ctx); err != nil {
			return fail(c, 503, "База недоступна")
		}
		return c.JSON(fiber.Map{"ok": true})
	})
	app.Post("/api/login", limiter.New(limiter.Config{Max: 15, Expiration: time.Minute}), a.login)
	app.Use("/api", func(c *fiber.Ctx) error {
		ctx, cancel := service.Context()
		defer cancel()
		u, err := a.DB.GetSessionUser(ctx, hash(c.Cookies("dauys_session")))
		if err != nil {
			return fail(c, 401, "Войдите в аккаунт")
		}
		c.Locals("user", service.User{ID: u.ID, Name: u.Name, Email: u.Email, Role: u.Role, Department: u.Department})
		return c.Next()
	})
	app.Get("/api/me", func(c *fiber.Ctx) error { return c.JSON(user(c)) })
	app.Post("/api/logout", func(c *fiber.Ctx) error {
		ctx, cancel := service.Context()
		defer cancel()
		if err := a.DB.DeleteSession(ctx, hash(c.Cookies("dauys_session"))); err != nil {
			return err
		}
		c.Cookie(&fiber.Cookie{Name: "dauys_session", Value: "", Path: "/", HTTPOnly: true, Secure: a.Secure, SameSite: "Lax", MaxAge: -1})
		return c.SendStatus(204)
	})
	app.Get("/api/meta", a.meta)
	app.Get("/api/appeals", a.list)
	app.Post("/api/appeals", a.create)
	app.Get("/api/appeals/similar", a.similar)
	app.Get("/api/appeals/:id/features", a.features)
	app.Patch("/api/appeals/:id/impact", a.saveImpact)
	app.Post("/api/appeals/:id/pilots", a.savePilot)
	app.Post("/api/appeals/:id/reopen", a.reopen)
	app.Get("/api/appeals/:id/sla", a.sla)
	app.Post("/api/appeals/:id/remind", a.remind)
	app.Get("/api/appeals/:id", a.detail)
	app.Patch("/api/appeals/:id", a.update)
	app.Post("/api/appeals/:id/comments", a.comment)
	app.Post("/api/appeals/:id/vote", a.vote)
	app.Post("/api/appeals/:id/files", a.upload)
	app.Get("/api/files/:id", a.file)
	app.Get("/api/analytics", a.dashboard)
	app.Get("/api/notifications", a.notifications)
	app.Post("/api/notifications/read", a.readNotifications)
	app.Get("/api/events", a.events)
	app.Patch("/api/admin/categories", a.category)
	app.Use("/api", func(c *fiber.Ctx) error { return fail(c, 404, "API-маршрут не найден") })
	if dir := os.Getenv("DIST_DIR"); dir != "" {
		app.Static("/", dir, fiber.Static{Index: "index.html", MaxAge: 0})
		app.Get("*", func(c *fiber.Ctx) error {
			if filepath.Ext(c.Path()) != "" {
				return c.SendStatus(404)
			}
			return c.SendFile(filepath.Join(dir, "index.html"))
		})
	}
	return app
}
func (a *API) login(c *fiber.Ctx) error {
	var in struct{ Email, Password string }
	if c.BodyParser(&in) != nil {
		return fail(c, 400, "Проверьте данные")
	}
	ctx, cancel := service.Context()
	defer cancel()
	u, err := a.DB.FindUser(ctx, strings.ToLower(strings.TrimSpace(in.Email)))
	if err != nil || bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.Password)) != nil {
		return fail(c, 401, "Неверная почта или пароль")
	}
	token := service.ID("")
	if err = a.DB.CreateSession(ctx, db.CreateSessionParams{TokenHash: hash(token), UserID: u.ID, ExpiresAt: timestamp(time.Now().Add(24 * time.Hour))}); err != nil {
		return err
	}
	c.Cookie(&fiber.Cookie{Name: "dauys_session", Value: token, HTTPOnly: true, Secure: a.Secure, SameSite: "Lax", Path: "/", MaxAge: 86400})
	return c.JSON(fiber.Map{"ok": true})
}
func (a *API) meta(c *fiber.Ctx) error {
	ctx, cancel := service.Context()
	defer cancel()
	cats, err := a.maps(ctx, `SELECT name,coalesce(assignee_id,'') AS assignee_id FROM categories ORDER BY name`)
	if err != nil {
		return err
	}
	users, err := a.maps(ctx, `SELECT id,name,role,department FROM users WHERE role<>'employee' ORDER BY name`)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"categories": cats, "executors": users, "public_url": os.Getenv("APP_PUBLIC_URL"), "departments": []string{"Закупки", "Проектирование", "Монтаж и сервис", "Бухгалтерия", "Продажи", "IT", "Офис"}})
}
func (a *API) list(c *fiber.Ctx) error {
	ctx, cancel := service.Context()
	defer cancel()
	f := service.Filter{Q: c.Query("q"), Status: c.Query("status"), Category: c.Query("category"), Department: c.Query("department"), Mine: c.Query("mine"), Sort: c.Query("sort"), Page: c.QueryInt("page", 1), Overdue: c.Query("overdue") == "true", Month: c.Query("month"), Kind: c.Query("kind"), DueFrom: c.Query("due_from"), DueTo: c.Query("due_to"), Unassigned: c.Query("unassigned") == "true", CreatedMonth: c.Query("created_month"), Assigned: c.Query("assigned") == "true"}
	items, total, err := a.Svc.List(ctx, user(c), f)
	if err != nil {
		if errors.Is(err, service.ErrInvalidFilter) {
			return fail(c, 400, err.Error())
		}
		return err
	}
	counts, err := a.Svc.Counts(ctx, user(c), f)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"items": items, "total": total, "page": f.Page, "counts": counts})
}
func (a *API) create(c *fiber.Ctx) error {
	var in service.Appeal
	if c.BodyParser(&in) != nil {
		return fail(c, 400, "Неверные данные")
	}
	ctx, cancel := service.Context()
	defer cancel()
	id, err := a.Svc.Create(ctx, user(c), in)
	if err != nil {
		return fail(c, 400, err.Error())
	}
	return c.Status(201).JSON(fiber.Map{"id": id})
}
func (a *API) detail(c *fiber.Ctx) error {
	ctx, cancel := service.Context()
	defer cancel()
	id := c.Params("id")
	item, err := a.Svc.Get(ctx, user(c).ID, id)
	if err != nil {
		return fail(c, 404, "Обращение не найдено")
	}
	comments, err := a.maps(ctx, `SELECT c.id,c.body,c.created_at,u.name,u.role,c.user_id AS author_id FROM comments c JOIN users u ON u.id=c.user_id WHERE c.appeal_id=$1 ORDER BY c.created_at`, id)
	if err != nil {
		return err
	}
	history, err := a.maps(ctx, `SELECT h.id::text,h.action,h.created_at,u.name,h.user_id AS actor_id,h.event_type,h.from_status,h.to_status,h.appeal_version,h.details FROM history h JOIN users u ON u.id=h.user_id WHERE h.appeal_id=$1 ORDER BY h.created_at,h.id`, id)
	if err != nil {
		return err
	}
	files, err := a.maps(ctx, `SELECT id,name,size FROM attachments WHERE appeal_id=$1`, id)
	if err != nil {
		return err
	}
	linked, err := a.maps(ctx, `SELECT id,title,affected FROM appeals WHERE parent_id=$1 OR (id=$2 AND $2<>'')`, id, item.ParentID)
	if err != nil {
		return err
	}
	u := user(c)
	canManage := u.Role == "admin" || u.Role == "executor" && u.ID == item.AssigneeID
	return c.JSON(fiber.Map{"appeal": item, "comments": comments, "history": history, "files": files, "linked": linked,
		"allowed_transitions": service.AllowedTransitions(u, item),
		"permissions":         fiber.Map{"can_edit": u.ID == item.AuthorID && (item.Status == "new" || item.Status == "waiting"), "can_manage": canManage && item.Status != "closed" && item.Status != "rejected", "can_comment": canManage || u.ID == item.AuthorID}})
}
func (a *API) update(c *fiber.Ctx) error {
	var in service.UpdateInput
	if c.BodyParser(&in) != nil {
		return fail(c, 400, "Неверные данные")
	}
	ctx, cancel := service.Context()
	defer cancel()
	version, err := a.Svc.Update(ctx, user(c), c.Params("id"), in)
	if err != nil {
		return featureError(c, err)
	}
	return c.JSON(fiber.Map{"ok": true, "version": version})
}
func (a *API) comment(c *fiber.Ctx) error {
	var in struct{ Body string }
	if c.BodyParser(&in) != nil {
		return fail(c, 400, "Неверный комментарий")
	}
	ctx, cancel := service.Context()
	defer cancel()
	if err := a.Svc.Comment(ctx, user(c), c.Params("id"), in.Body); err != nil {
		return featureError(c, err)
	}
	return c.SendStatus(201)
}
func (a *API) vote(c *fiber.Ctx) error {
	ctx, cancel := service.Context()
	defer cancel()
	item, err := a.Svc.Get(ctx, user(c).ID, c.Params("id"))
	if err != nil {
		return fail(c, 404, "Обращение не найдено")
	}
	if item.Kind != "idea" {
		return fail(c, 400, "Поддержать можно предложение")
	}
	tx, err := a.Svc.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, item.ID+user(c).ID); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `DELETE FROM votes WHERE appeal_id=$1 AND user_id=$2`, item.ID, user(c).ID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		_, err = tx.Exec(ctx, `INSERT INTO votes(appeal_id,user_id) VALUES($1,$2)`, item.ID, user(c).ID)
	}
	if err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"ok": true})
}
func (a *API) upload(c *fiber.Ctx) error {
	ctx, cancel := service.Context()
	defer cancel()
	item, err := a.Svc.Get(ctx, user(c).ID, c.Params("id"))
	if err != nil {
		return fail(c, 404, "Обращение не найдено")
	}
	u := user(c)
	if u.ID != item.AuthorID && u.Role != "admin" && !(u.Role == "executor" && u.ID == item.AssigneeID) {
		return fail(c, 403, "Нет прав")
	}
	f, err := c.FormFile("file")
	if err != nil || f.Size > 10*1024*1024 {
		return fail(c, 400, "Файл должен быть меньше 10 МБ")
	}
	ext := strings.ToLower(filepath.Ext(f.Filename))
	if !strings.Contains("|.pdf|.png|.jpg|.jpeg|.txt|.csv|.docx|.xlsx|", "|"+ext+"|") {
		return fail(c, 400, "Разрешены PDF, изображения, TXT, CSV, DOCX и XLSX")
	}
	id := service.ID("f_")
	if err = os.MkdirAll(a.Uploads, 0700); err != nil {
		return err
	}
	path := filepath.Join(a.Uploads, id)
	if err = c.SaveFile(f, path); err != nil {
		return err
	}
	err = a.Svc.AddAttachment(ctx, u, item.ID, id, filepath.Base(f.Filename), f.Size)
	if err != nil {
		_ = os.Remove(path)
		return featureError(c, err)
	}
	return c.Status(201).JSON(fiber.Map{"id": id})
}
func (a *API) file(c *fiber.Ctx) error {
	ctx, cancel := service.Context()
	defer cancel()
	var name string
	id := c.Params("id")
	if strings.ContainsAny(id, "/\\.") {
		return fail(c, 400, "Некорректный файл")
	}
	err := a.Svc.Pool.QueryRow(ctx, `SELECT name FROM attachments WHERE id=$1`, id).Scan(&name)
	if err != nil {
		return fail(c, 404, "Файл не найден")
	}
	c.Set("Content-Type", "application/octet-stream")
	return c.Download(filepath.Join(a.Uploads, id), name)
}
func (a *API) notifications(c *fiber.Ctx) error {
	ctx, cancel := service.Context()
	defer cancel()
	out, err := a.maps(ctx, `SELECT id,appeal_id,body,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, user(c).ID)
	if err != nil {
		return err
	}
	return c.JSON(out)
}
func (a *API) readNotifications(c *fiber.Ctx) error {
	ctx, cancel := service.Context()
	defer cancel()
	_, err := a.Svc.Pool.Exec(ctx, `UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, user(c).ID)
	if err != nil {
		return err
	}
	return c.SendStatus(204)
}
func (a *API) events(c *fiber.Ctx) error {
	uid := user(c).ID
	tokenHash := hash(c.Cookies("dauys_session"))
	c.Set("Content-Type", "text/event-stream")
	c.Set("X-Accel-Buffering", "no")
	c.Set("Cache-Control", "no-cache")
	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()
		deadline := time.Now().Add(5 * time.Minute)
		last := ""
		for time.Now().Before(deadline) {
			ctx, cancel := service.Context()
			var revision string
			err := a.Svc.Pool.QueryRow(ctx, `SELECT coalesce(max(id),0)::text||':'||(SELECT count(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL)::text||':'||(SELECT revision::text FROM workspace_revision) FROM notifications WHERE user_id=$1 AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=$2 AND expires_at>now())`, uid, tokenHash).Scan(&revision)
			var valid bool
			sessionErr := a.Svc.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM sessions WHERE token_hash=$1 AND expires_at>now())`, tokenHash).Scan(&valid)
			cancel()
			if sessionErr != nil || !valid {
				return
			}
			if err == nil && revision != last {
				payload, _ := json.Marshal(fiber.Map{"revision": revision})
				if _, e := fmt.Fprintf(w, "event: update\ndata: %s\n\n", payload); e != nil {
					return
				}
				last = revision
			} else {
				if _, e := fmt.Fprint(w, ": heartbeat\n\n"); e != nil {
					return
				}
			}
			if w.Flush() != nil {
				return
			}
			<-ticker.C
		}
	})
	return nil
}
func (a *API) category(c *fiber.Ctx) error {
	if user(c).Role != "admin" {
		return fail(c, 403, "Доступно администратору")
	}
	var in struct {
		Name       string `json:"name"`
		AssigneeID string `json:"assignee_id"`
	}
	if c.BodyParser(&in) != nil || strings.TrimSpace(in.Name) == "" || len(in.Name) > 120 {
		return fail(c, 400, "Проверьте категорию")
	}
	ctx, cancel := service.Context()
	defer cancel()
	if in.AssigneeID != "" {
		var role string
		err := a.Svc.Pool.QueryRow(ctx, `SELECT role FROM users WHERE id=$1`, in.AssigneeID).Scan(&role)
		if err != nil || role == "employee" {
			return fail(c, 400, "Выберите исполнителя")
		}
	}
	_, err := a.Svc.Pool.Exec(ctx, `INSERT INTO categories(name,assignee_id) VALUES($1,nullif($2,'')) ON CONFLICT(name) DO UPDATE SET assignee_id=excluded.assignee_id`, in.Name, in.AssigneeID)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"ok": true})
}

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"os"
	"time"
)

type seedRow struct{ Title, Description, Category, Department, Kind, Status, Priority string }

func seed(ctx context.Context, pool *pgxpool.Pool) error {
	if os.Getenv("DEMO_MODE") != "true" {
		return nil
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(716204)`); err != nil {
		return err
	}
	var count int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return tx.Commit(ctx)
	}
	demoPassword := os.Getenv("DEMO_PASSWORD")
	if demoPassword == "" {
		demoPassword = "DauysDemo2026!"
	}
	password, err := bcrypt.GenerateFromPassword([]byte(demoPassword), 12)
	if err != nil {
		return err
	}
	for _, u := range []struct{ ID, Name, Email, Role, Dept string }{{"employee", "Алия Касымова", "employee@dauys.local", "employee", "Закупки"}, {"executor", "Данияр Садыков", "executor@dauys.local", "executor", "IT"}, {"admin", "Администратор Dauys", "admin@dauys.local", "admin", "Офис"}} {
		if _, err = tx.Exec(ctx, `INSERT INTO users(id,name,email,password_hash,role,department) VALUES($1,$2,$3,$4,$5,$6)`, u.ID, u.Name, u.Email, string(password), u.Role, u.Dept); err != nil {
			return err
		}
	}
	data, _ := assets.ReadFile("seed.json")
	var rows []seedRow
	if err = json.Unmarshal(data, &rows); err != nil {
		return err
	}
	for i, r := range rows {
		id := fmt.Sprintf("A-%03d", i+1)
		if _, err = tx.Exec(ctx, `INSERT INTO categories(name,assignee_id) VALUES($1,'executor') ON CONFLICT DO NOTHING`, r.Category); err != nil {
			return err
		}
		days := 20 - i
		created := time.Now().AddDate(0, 0, -days)
		due := created.AddDate(0, 0, 7)
		result := ""
		if r.Status == "resolved" || r.Status == "closed" {
			result = "Внедрено пилотное улучшение. Результат проверен на демонстрационных данных."
		}
		if r.Status == "rejected" {
			result = "Сейчас нет подходящего помещения. Вернёмся к предложению при перепланировке."
		}
		if r.Kind == "praise" && r.Status == "closed" {
			result = "Положительный отзыв зафиксирован и передан организаторам обучения."
		}
		actual := 0
		if r.Status == "closed" && r.Kind != "praise" {
			actual = 48000
		}
		_, err = tx.Exec(ctx, `INSERT INTO appeals(id,title,description,kind,category,department,priority,status,author_id,assignee_id,affected,expected_effect,actual_effect,result,due_at,created_at,updated_at,confirmed_at,response_due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'employee','executor',$9,$10,$11,$12,$13,$14,$15,CASE WHEN $8='closed' AND $4<>'praise' THEN $15::timestamptz ELSE NULL END,$14::timestamptz+interval '18 hours')`, id, r.Title, r.Description, r.Kind, r.Category, r.Department, r.Priority, r.Status, 1+i%8, (i%5)*25000, actual, result, due, created, created.Add(24*time.Hour))
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO history(appeal_id,user_id,action,created_at) VALUES($1,'employee','Обращение зарегистрировано',$2),($1,'executor',$3,$4)`, id, created, "Текущий статус: "+r.Status, created.Add(24*time.Hour)); err != nil {
			return err
		}
		if r.Status == "waiting" {
			if _, err = tx.Exec(ctx, `INSERT INTO comments(appeal_id,user_id,body,created_at) VALUES($1,'executor','Уточните, пожалуйста, пример ситуации и приложите тестовый материал.',$2)`, id, created.Add(6*time.Hour)); err != nil {
				return err
			}
		}
	}
	return tx.Commit(ctx)
}

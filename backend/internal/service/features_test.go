package service

import "testing"

func TestImpactValidation(t *testing.T) {
	for _, in := range []ImpactInput{{People: 0}, {People: 1, Minutes: -1}, {People: 1, Minutes: 1441}, {People: 1, OccurrencesMonth: 1001}, {People: 1, HourlyRate: -1}} {
		if in.Validate() == nil {
			t.Fatal("invalid impact accepted", in)
		}
	}
	i := ImpactInput{People: 12, Minutes: 10, OccurrencesMonth: 20}
	if i.Validate() != nil || float64(i.People)*i.Minutes*i.OccurrencesMonth/60 != 40 {
		t.Fatal("40 hour calculation failed")
	}
}
func TestConceptSearch(t *testing.T) {
	c := []SimilarCandidate{{ID: "instructions", Title: "Актуальная редакция инструкции", Description: "В общих папках несколько версий документов"}, {ID: "purchase", Title: "Согласование закупки", Description: "Поставщик ждёт утверждения договора"}}
	for _, q := range []string{"Работаем по старой памятке", "Где найти финальную версию документа"} {
		r := RankSimilar(q, c)
		if len(r) == 0 || r[0].ID != "instructions" {
			t.Fatalf("concept match failed for %q: %+v", q, r)
		}
	}
	if len(RankSimilar("Заказать пиццу сегодня", c)) != 0 {
		t.Fatal("unrelated query matched")
	}
}
func TestPilotGoalDirection(t *testing.T) {
	p := PilotInput{Hypothesis: "Создадим единый каталог инструкций", Scope: "Закупки", Metric: "Поиск инструкции", Unit: "мин", Baseline: 12, Target: 4, Direction: "decrease", EndAt: "2026-11-20"}
	if p.ValidatePlan() != nil {
		t.Fatal("valid plan rejected")
	}
	p.Target = 15
	if p.ValidatePlan() == nil {
		t.Fatal("worsening target accepted")
	}
}

func TestDueFilterValidation(t *testing.T) {
	for _, filter := range []Filter{{DueFrom: "bad"}, {DueTo: "2026-02-31"}, {DueFrom: "2026-12-01", DueTo: "2026-11-01"}, {Kind: "unknown"}} {
		if _, err := filterArgs(User{ID: "employee"}, filter); err == nil {
			t.Fatal("invalid filter accepted", filter)
		}
	}
	if _, err := filterArgs(User{ID: "employee"}, Filter{DueFrom: "2026-11-01", DueTo: "2026-11-01", Kind: "praise"}); err != nil {
		t.Fatal(err)
	}
}

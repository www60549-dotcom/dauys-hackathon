package service

import (
	"context"
	"math"
	"sort"
	"strings"
	"unicode"
)

// Concept expansion is deliberately local and explainable; it is not an embedding model.
var conceptGroups = []struct {
	Label string
	Stems []string
}{
	{"инструкции и база знаний", []string{"инструк", "памятк", "руководств", "баз знан", "справочн", "мануал"}},
	{"актуальность и версии документов", []string{"актуальн", "редакц", "верс", "устар", "старой", "старым", "старые", "финальн", "архив", "последн"}},
	{"доступ и права", []string{"доступ", "прав", "разрешен", "не могу открыть", "не открывает", "авторизац", "учетн", "логин"}},
	{"закупки и согласование", []string{"закуп", "согласов", "одобрен", "утвержд", "приобрет", "поставщик"}},
	{"сроки и ожидание", []string{"срок", "ожидан", "ждать", "долго", "задерж", "медлен", "дней", "опозд", "быстр"}},
	{"обучение и адаптация", []string{"обуч", "нович", "нового сотруд", "новым сотруд", "новые сотруд", "настав", "семинар", "занят", "учебн"}},
	{"документы и хранение", []string{"документ", "папк", "файл", "каталог", "хранен", "спецификац"}},
	{"ручной ввод и интеграции", []string{"повторн ввод", "ручн", "синхрон", "интеграц", "перенос данн", "ввод данн", "систем"}},
	{"договорная работа", []string{"договор", "контракт", "приложен к договор"}},
	{"планирование задач", []string{"задач", "поручен", "загруз", "планир", "распредел", "ресурс"}},
}

type SimilarCandidate struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"-"`
	Status      string   `json:"status"`
	Category    string   `json:"category"`
	Department  string   `json:"department"`
	Score       float64  `json:"score"`
	Reasons     []string `json:"reasons"`
	Method      string   `json:"method"`
}

func normalized(text string) string { return strings.ReplaceAll(strings.ToLower(text), "ё", "е") }
func concepts(text string) map[int]bool {
	out := map[int]bool{}
	text = normalized(text)
	for i, g := range conceptGroups {
		for _, stem := range g.Stems {
			if strings.Contains(text, stem) {
				out[i] = true
				break
			}
		}
	}
	return out
}
func tokens(text string) map[string]bool {
	out := map[string]bool{}
	for _, word := range strings.FieldsFunc(normalized(text), func(r rune) bool { return !unicode.IsLetter(r) }) {
		r := []rune(word)
		if len(r) < 4 {
			continue
		}
		if len(r) > 6 {
			r = r[:6]
		}
		out[string(r)] = true
	}
	return out
}
func RankSimilar(text string, candidates []SimilarCandidate) []SimilarCandidate {
	query := concepts(text)
	qt := tokens(text)
	frequency := map[int]int{}
	vectors := make([]map[int]bool, len(candidates))
	for i, c := range candidates {
		vectors[i] = concepts(c.Title + " " + c.Description)
		for k := range vectors[i] {
			frequency[k]++
		}
	}
	out := []SimilarCandidate{}
	for i, c := range candidates {
		common, queryMass, candidateMass := 0., 0., 0.
		reasons := []string{}
		for k := range query {
			w := 1 + math.Log(float64(len(candidates)+1)/float64(frequency[k]+1))
			queryMass += w * w
			if vectors[i][k] {
				common += w * w
				reasons = append(reasons, conceptGroups[k].Label)
			}
		}
		for k := range vectors[i] {
			w := 1 + math.Log(float64(len(candidates)+1)/float64(frequency[k]+1))
			candidateMass += w * w
		}
		semantic := 0.
		if queryMass > 0 && candidateMass > 0 {
			semantic = common / math.Sqrt(queryMass*candidateMass)
		}
		ct := tokens(c.Title + " " + c.Description)
		intersection := 0
		for t := range qt {
			if ct[t] {
				intersection++
			}
		}
		lexical := 0.
		if len(qt) > 0 && len(ct) > 0 {
			lexical = float64(intersection) / math.Sqrt(float64(len(qt)*len(ct)))
		}
		score := semantic*.8 + lexical*.2
		if len(query) == 0 {
			score = lexical
		}
		if score < .18 {
			continue
		}
		sort.Strings(reasons)
		if len(reasons) == 0 {
			reasons = append(reasons, "совпадение слов и их основ")
		}
		c.Score = math.Round(score * 100)
		c.Reasons = reasons
		c.Method = "local_concepts"
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Score == out[j].Score {
			return out[i].ID < out[j].ID
		}
		return out[i].Score > out[j].Score
	})
	if len(out) > 5 {
		out = out[:5]
	}
	return out
}
func (s *Service) Similar(ctx context.Context, text, exclude string) ([]SimilarCandidate, error) {
	rows, err := s.Pool.Query(ctx, `SELECT id,title,description,status,category,department FROM appeals WHERE id<>$1 AND kind<>'praise' AND parent_id IS NULL ORDER BY created_at DESC LIMIT 1000`, exclude)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	candidates := []SimilarCandidate{}
	for rows.Next() {
		var c SimilarCandidate
		if err = rows.Scan(&c.ID, &c.Title, &c.Description, &c.Status, &c.Category, &c.Department); err != nil {
			return nil, err
		}
		candidates = append(candidates, c)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return RankSimilar(text, candidates), nil
}

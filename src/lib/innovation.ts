import type {Appeal, ImpactEstimate, ComposeContext, EffectMeasurement} from '../types';

export const DEMO_USER_ID = 'demo-aliya';
export const DEMO_AUTHOR = 'Алия Касымова';
export const DEFAULT_ESTIMATE: ImpactEstimate = {minutesPerDay: 15, employees: 25, hourlyRate: 2500, workdays: 247};
export const SLA_THRESHOLD_HOURS = 18;
const completed = new Set(['resolved', 'closed', 'rejected']);

export function estimateImpact(input: ImpactEstimate) {
  const {minutesPerDay, employees, hourlyRate, workdays} = input;
  if (![minutesPerDay, employees, hourlyRate, workdays].every(Number.isFinite)
    || minutesPerDay < 5 || minutesPerDay > 60 || !Number.isInteger(employees) || employees < 1 || employees > 150
    || hourlyRate < 0 || hourlyRate > 1_000_000 || !Number.isInteger(workdays) || workdays < 1 || workdays > 366) throw new Error('Проверьте допущения расчёта.');
  const hoursYear = minutesPerDay / 60 * employees * workdays;
  return {hoursYear, moneyYear: Math.round(hoursYear * hourlyRate)};
}

const routes = [
  {label: 'Закупки', category: 'Межотдельное взаимодействие', department: 'Закупки', officer: 'Анна Смирнова', role: 'Руководитель закупок', words: ['закуп', 'поставщик', 'кабел', 'приобретен', 'поставк']},
  {label: 'IT и сервисы', category: 'Интеграции и IT', department: 'IT', officer: 'Илья Волков', role: 'IT-специалист', words: ['программ', 'ошибк', 'доступ', 'интеграц', 'синхрониз', 'систем', 'сервер', 'логин']},
  {label: 'Проектирование', category: 'Проектная деятельность', department: 'Проектирование', officer: 'Данияр Садыков', role: 'Координатор проектов', words: ['проектир', 'чертеж', 'спецификац', 'номенклатур']},
  {label: 'Монтаж и сервис', category: 'Постановка задач', department: 'Монтаж и сервис', officer: 'Данияр Садыков', role: 'Координатор сервиса', words: ['монтаж', 'пусконалад', 'ремонт', 'сервисн']},
  {label: 'Рабочие процессы', category: 'Регламенты', department: 'Бухгалтерия', officer: 'Данияр Садыков', role: 'Ответственный за процессы', words: ['регламент', 'согласован', 'памятк', 'инструкц', 'процесс']},
];
export function normalize(text: string) { return text.toLowerCase().replaceAll('ё', 'е'); }
export function detectRoute(text: string) {
  const normalized = normalize(text);
  const ranked = routes.map(route => ({route, score: route.words.filter(word => normalized.includes(word)).length})).sort((a, b) => b.score - a.score);
  if (!ranked[0].score || ranked[0].score === ranked[1].score) return null;
  return {...ranked[0].route, responseHours: 4, demoConfidence: 94};
}
export function assigneeForCategory(category: string) { return routes.find(route => route.category === category)?.officer || 'Данияр Садыков'; }

const concepts: [string, string[]][] = [
  ['инструкции и знания', ['инструк', 'памят', 'обуч', 'настав', 'знани']],
  ['версии документов', ['верси', 'редакц', 'актуальн', 'архив', 'старой']],
  ['закупки', ['закуп', 'поставщик', 'приобрет', 'кабел']],
  ['согласования', ['соглас', 'утвержд', 'одобрен', 'провер']],
  ['доступ', ['доступ', 'папк', 'разрешен', 'учетн', 'логин']],
  ['интеграции и ввод данных', ['повторн', 'ручн', 'ввод', 'синхрон', 'интеграц', 'систем']],
  ['договоры', ['договор', 'контракт', 'приложени']],
  ['постановка задач', ['поручен', 'задач', 'цель', 'ожидаем', 'завершен']],
  ['сроки', ['срок', 'задерж', 'ожидан', 'срочн', 'ответ']],
];
const stopwords = new Set(['это', 'как', 'для', 'при', 'что', 'или', 'без', 'его', 'так', 'всех', 'нужно', 'нужен', 'предлагаю', 'хотелось', 'иногда', 'чтобы', 'котор', 'можно']);
function tokens(text: string) { return new Set((normalize(text).match(/[а-яa-z0-9]+/g) || []).filter(word => word.length > 3 && !stopwords.has(word)).map(word => word.slice(0, 6))); }
function themes(text: string) { const value = normalize(text); return new Set(concepts.filter(([, words]) => words.some(word => value.includes(word))).map(([label]) => label)); }
export function findSimilarAppeals(text: string, appeals: Appeal[]) {
  if (text.trim().length < 8) return [];
  const queryTokens = tokens(text), queryThemes = themes(text);
  return appeals.filter(item => item.kind !== 'praise' && item.status !== 'rejected').map(appeal => {
    const candidate = `${appeal.title} ${appeal.description}`;
    const candidateTokens = tokens(candidate), candidateThemes = themes(candidate);
    const reasons = [...queryThemes].filter(theme => candidateThemes.has(theme));
    const lexical = [...queryTokens].filter(token => candidateTokens.has(token)).length / Math.max(1, Math.sqrt(queryTokens.size * candidateTokens.size));
    const semantic = reasons.length / Math.max(1, Math.sqrt(queryThemes.size * candidateThemes.size));
    const score = queryThemes.size ? semantic * 0.8 + lexical * 0.2 : lexical;
    return {appeal, score, reasons};
  }).filter(item => item.score >= 0.24).sort((a, b) => b.score - a.score || b.appeal.updatedAt - a.appeal.updatedAt).slice(0, 3);
}

export function addSupport(appeal: Appeal, userId = DEMO_USER_ID): Appeal {
  if (userId === DEMO_USER_ID && appeal.author === DEMO_AUTHOR) return appeal;
  if (appeal.supporterIds?.includes(userId)) return appeal;
  return {...appeal, supporterIds: [...(appeal.supporterIds || []), userId]};
}
export function reportedCount(appeal: Appeal) { return 1 + new Set(appeal.supporterIds || []).size; }
export function slaWaitingHours(appeal: Appeal, now: number) {
  if (completed.has(appeal.status) || appeal.firstResponseHours !== null || appeal.comments.some(comment => comment.author !== appeal.author)) return null;
  const hours = Math.max(0, (now - appeal.createdAt) / 3_600_000);
  return hours > SLA_THRESHOLD_HOURS ? hours : null;
}
export function requestEscalation(appeal: Appeal, now: number): Appeal {
  if (slaWaitingHours(appeal, now) === null || appeal.escalation) return appeal;
  return {...appeal, escalation: {requestedAt: now}, updatedAt: now, history: [...appeal.history, {status: appeal.status, createdAt: now, label: 'Запрос ускорения добавлен в локальную очередь'}]};
}

export function recordEffect(appeal: Appeal, input: Omit<EffectMeasurement, 'recordedAt'>, now: number): Appeal {
  if (!Number.isFinite(input.hoursPerMonth) || input.hoursPerMonth < 0 || input.hoursPerMonth > 100000 || input.evidence.trim().length < 10 || input.evidence.length > 3000) throw new Error('Укажите часы и основание замера (от 10 символов).');
  if (!['resolved', 'closed'].includes(appeal.status) || appeal.kind === 'praise') return appeal;
  return {...appeal, status: 'resolved', updatedAt: now,
    result: appeal.result.replace('Результат подтверждён автором.', 'Ожидаем подтверждение автора.'),
    measurement: {...input, evidence: input.evidence.trim(), recordedAt: now},
    history: [...appeal.history, {status: 'resolved', createdAt: now, label: 'Записан замер эффекта. Требуется подтверждение автора.'}]};
}

export function confirmResult(appeal: Appeal, now: number, author = DEMO_AUTHOR): Appeal {
  if (appeal.status !== 'resolved' || appeal.author !== author) return appeal;
  return {...appeal, status: 'closed', result: appeal.result.replace('Ожидаем подтверждение автора.', 'Результат подтверждён автором.'), updatedAt: now, history: [...appeal.history, {status: 'closed', createdAt: now}]};
}

export function combineTranscript(base: string, segments: string[]) {
  return [base.trim(), segments.map(part => part.trim()).filter(Boolean).join(' ')].filter(Boolean).join(' ').slice(0, 10_000);
}

export function buildComposeUrl(base: string, context: ComposeContext) {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Введите HTTP(S)-адрес без логина и пароля.');
  url.search = ''; url.hash = ''; url.searchParams.set('compose', '1');
  if (context.category) url.searchParams.set('category', context.category);
  if (context.department) url.searchParams.set('department', context.department);
  return url.toString();
}

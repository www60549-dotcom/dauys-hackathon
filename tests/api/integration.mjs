import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const base = process.env.BASE_URL || 'http://127.0.0.1:5175';
assert.equal(process.env.DAUYS_ALLOW_TEST_WRITES, '1', 'Use an isolated test database and set DAUYS_ALLOW_TEST_WRITES=1');
const source = await readFile(new URL('../../src/api/client.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022}}).outputText;
const {api, ApiError} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const nativeFetch = globalThis.fetch;
const cookies = new Map();
let role = 'employee', checks = 0;
const check = (condition, label) => {assert.ok(condition, label); checks++; console.log('PASS', label);};
globalThis.fetch = async (url, options = {}) => {
  const caller = role, headers = new Headers(options.headers);
  if (cookies.get(caller)) headers.set('Cookie', cookies.get(caller));
  headers.set('Origin', new URL(base).origin);
  const response = await nativeFetch(new URL(url, base), {...options, headers});
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookies.set(caller, setCookie.split(';')[0]);
  return response;
};
try {
  await assert.rejects(api.me(), error => error instanceof ApiError && error.status === 401);
  check(true, 'React client rejects anonymous access');
  for (const account of ['employee', 'executor', 'admin']) {
    role = account; await api.login(`${account}@dauys.local`, process.env.DAUYS_TEST_PASSWORD || 'DauysDemo2026!');
    const me = await api.me(); check(me.role === account && me.id, `cookie session identifies ${account}`);
  }
  role = 'employee';
  const employee = await api.me(), meta = await api.meta();
  check(meta.departments.includes('Монтаж и сервис') && meta.categories.length, 'React receives server metadata including installation department');
  const {id} = await api.create({title: 'Интеграция React и Go: проверка полного цикла', description: 'Изолированная проверка нового TypeScript-клиента через Vite proxy. Требуется назначение и уточнение.', kind: 'problem', category: meta.categories[0].name, department: 'Монтаж и сервис', priority: 'high', affected: 3, expected_effect: 0});
  let detail = await api.detail(id);
  check(detail.appeal.author_id === employee.id && detail.appeal.department === 'Монтаж и сервис' && detail.history.length === 1, 'React creation is persisted with server identity and history');
  await api.edit(id, {title: detail.appeal.title, description: `${detail.appeal.description} Автор уточнил описание.`, solution: ''});
  detail = await api.detail(id);
  check(detail.appeal.description.endsWith('Автор уточнил описание.'), 'author can edit their new ticket through the React client');
  role = 'executor';
  const executor = await api.me();
  const assigned = await api.appeals({assigned: 'true', q: id});
  check(assigned.items.length === 1 && assigned.items[0].assignee_id === executor.id, 'executor server queue filters assignments');
  const manage = (appeal, status, result = '') => api.manage(id, {status, priority: appeal.priority, assignee_id: appeal.assignee_id, parent_id: appeal.parent_id, result, actual_effect: 0, due_at: appeal.due_at});
  await manage(detail.appeal, 'waiting');
  await api.comment(id, 'Уточните, на каком объекте требуется изменение процесса.');
  role = 'employee';
  await api.comment(id, 'Проверяем процесс на демонстрационном объекте. Данные уточнены.');
  detail = await api.detail(id);
  check(detail.appeal.status === 'waiting' && detail.comments.length === 2 && detail.comments.some(comment => comment.author_id === employee.id), 'clarification uses real comments and stable author IDs');
  const file = new File(['Dauys integration attachment'], 'integration.txt', {type: 'text/plain'});
  await api.upload(id, file);
  detail = await api.detail(id);
  const attachment = detail.files.find(value => value.name === 'integration.txt');
  assert.ok(attachment);
  const download = await fetch(`/api/files/${attachment.id}`);
  check(download.ok && (await download.text()).includes('Dauys integration'), 'multipart upload and protected download work through proxy');
  role = 'executor';
  await manage(detail.appeal, 'resolved', 'Процесс проверен и исправлен. Ожидаем подтверждение автора.');
  role = 'employee';
  await api.confirm(id);
  detail = await api.detail(id);
  check(detail.appeal.status === 'closed' && detail.appeal.confirmed && detail.history.length >= 4, 'solution is confirmed by author and stored in PostgreSQL');
  const active = await api.appeals({mine: 'true', status: 'active', q: id});
  check(active.items.length === 0 && Number.isInteger(active.counts.active), 'active queue excludes confirmed tickets and exposes server count');
  let page = await api.appeals({});
  for (let index = page.total; index <= 30; index++) {
    await api.create({title: `Изолированная проверка пагинации ${index}`, description: 'Синтетическая запись только для проверки серверной пагинации и агрегатов.', kind: 'problem', category: meta.categories[0].name, department: 'IT', priority: 'medium', affected: 1, expected_effect: 0});
  }
  page = await api.appeals({});
  const dashboard = await api.dashboard({});
  check(page.items.length === 30 && page.total > 30 && dashboard.summary.total === page.total && dashboard.summary.closed > 0, 'analytics aggregates the full database, beyond one list page');
  const forbidden = await nativeFetch(`${base}/api/appeals`, {method: 'POST', headers: {Origin: 'https://untrusted.invalid', Cookie: cookies.get('employee'), 'Content-Type': 'application/json'}, body: '{}'});
  check(forbidden.status === 403, 'unsafe requests retain Origin protection behind Vite');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
  try {
    const events = await nativeFetch(`${base}/api/events`, {headers: {Cookie: cookies.get('employee')}, signal: controller.signal});
    const reader = events.body.getReader(); let text = '';
    while (!text.includes('\n\n')) {const chunk = await reader.read(); if (chunk.done) break; text += new TextDecoder().decode(chunk.value);}
    check(events.headers.get('content-type').includes('text/event-stream') && text.includes('event: update') && text.includes('revision'), 'authenticated named SSE update passes through Vite without buffering');
    await reader.cancel();
  } finally {clearTimeout(timer); controller.abort();}
  await api.logout();
  await assert.rejects(api.me(), error => error instanceof ApiError && error.status === 401);
  check(true, 'logout invalidates server session');
  console.log(JSON.stringify({status: 'PASS', checks, appeal: id, scope: 'actual React API client → Vite → Go → isolated PostgreSQL'}));
} finally {globalThis.fetch = nativeFetch;}

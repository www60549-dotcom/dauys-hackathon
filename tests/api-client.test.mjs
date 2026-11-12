import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const {request, ApiError, queryString} = await import(compile(await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8')));
const typesURL = compile(await readFile(new URL('../src/types.ts', import.meta.url), 'utf8'));
const adaptersSource = (await readFile(new URL('../src/api/adapters.ts', import.meta.url), 'utf8')).replace("from '../types'", `from '${typesURL}'`);
const {apiDate, toAppeal, toNotification} = await import(compile(adaptersSource));
async function mockFetch(implementation, run) {const original = globalThis.fetch; globalThis.fetch = implementation; try {await run();} finally {globalThis.fetch = original;}}

test('API handles non-JSON 201 and empty 204 without retrying writes', async () => {
  let calls = 0;
  await mockFetch(async () => {calls++; return new Response('Created', {status: 201});}, async () => assert.equal(await request('/appeals/id/comments', {method: 'POST', body: {body: 'Комментарий'}}), undefined));
  assert.equal(calls, 1);
  await mockFetch(async () => new Response(null, {status: 204}), async () => assert.equal(await request('/logout', {method: 'POST'}), undefined));
});
test('API sends same-origin credentials and lets the browser create multipart boundaries', async () => {
  const body = new FormData(); body.set('file', new Blob(['file']), 'file.txt');
  await mockFetch(async (url, options) => {assert.equal(url, '/api/appeals/id/files'); assert.equal(options.credentials, 'same-origin'); assert.equal(options.body, body); assert.equal(options.headers.has('Content-Type'), false); return new Response('{"id":"file"}', {headers: {'Content-Type': 'application/json'}});}, async () => assert.deepEqual(await request('/appeals/id/files', {method: 'POST', body}), {id: 'file'}));
});
test('API preserves server validation errors and rejects an HTML proxy fallback', async () => {
  await mockFetch(async () => new Response('{"error":"Выберите исполнителя"}', {status: 400, headers: {'Content-Type': 'application/json'}}), async () => assert.rejects(request('/appeals/id', {method: 'PATCH', body: {}}), error => error instanceof ApiError && error.status === 400 && error.message === 'Выберите исполнителя'));
  await mockFetch(async () => new Response('<html>Vite</html>'), async () => assert.rejects(request('/me'), /proxy/));
  await mockFetch(async () => new Response('<html>Vite</html>'), async () => assert.rejects(request('/appeals', {method: 'POST', body: {}}), /proxy/));
});
test('API preserves cancellation and reports network failure without synthetic fallback', async () => {
  await mockFetch(async () => {throw new DOMException('Cancelled', 'AbortError');}, async () => assert.rejects(request('/me'), error => error.name === 'AbortError'));
  await mockFetch(async () => {throw new TypeError('offline');}, async () => assert.rejects(request('/me'), error => error instanceof ApiError && error.status === 0));
});
test('API encodes filters, preserving page and empty-value semantics', () => {
  const query = new URLSearchParams(queryString({q: 'доступ & проект', page: 2, status: '', department: undefined}));
  assert.equal(query.get('q'), 'доступ & проект'); assert.equal(query.get('page'), '2'); assert.equal(query.has('status'), false);
});
test('conflict response preserves the code and current version for draft recovery', async () => {
  await mockFetch(async () => new Response('{"error":"Карточка изменена","code":"version_conflict","current_version":4}',{status:409,headers:{'Content-Type':'application/json'}}),async()=>assert.rejects(request('/appeals/id',{method:'PATCH',body:{expected_version:2}}),error=>error instanceof ApiError && error.status===409 && error.code==='version_conflict' && error.currentVersion===4));
});
const item = {id: 'A-id', title: 'Обращение', description: 'Описание', category: 'IT', department: 'IT', kind: 'problem', status: 'resolved', priority: 'critical', author_id: 'u1', author: 'Одинаковое Имя', assignee_id: 'u2', assignee: 'Одинаковое Имя', created_at: '2026-11-01T09:00:00+05:00', updated_at: '2026-11-02T09:00:00+05:00', due_at: '2026-11-08T09:00:00+05:00', result: 'Готовое решение', confirmed: false, votes: 0, voted: false};
test('adapter preserves IDs, timezone and unknown history instead of inventing transitions', () => {
  const appeal = toAppeal(item, {comments: [{id: 1, author_id: 'u2', name: 'Одинаковое Имя', body: 'Ответ', created_at: '2026-11-01T11:00:00+05:00'}], history: [{id: 2, action: 'Данные обновлены', name: 'Исполнитель', created_at: item.updated_at}]});
  assert.equal(appeal.authorId, 'u1'); assert.equal(appeal.firstResponseHours, 2); assert.equal(appeal.priority, 'critical'); assert.equal(appeal.history[0].status, undefined); assert.equal(appeal.history[0].label, 'Данные обновлены'); assert.equal(appeal.createdAt, Date.UTC(2026, 10, 1, 4));
  assert.throws(() => apiDate('invalid'), /дату/); assert.throws(() => toAppeal({...item, status: 'unknown'}), /статус/);
});
test('notification read state comes from read_at and IDs are normalized', () => {
  const notification = {id: 7, appeal_id: item.id, body: 'Ответ', created_at: item.updated_at, read_at: null};
  assert.equal(toNotification(notification).read, false); assert.equal(toNotification({...notification, read_at: item.updated_at}).read, true); assert.equal(toNotification(notification).id, '7');
});
test('adapter reads explicit transition fields without copying the current status into older events',()=>{
  const appeal=toAppeal({...item,status:'closed'},{comments:[],history:[{action:'Статус изменён',name:'Исполнитель',created_at:item.updated_at,event_type:'status_changed',from_status:'progress',to_status:'resolved',appeal_version:3}]});
  assert.equal(appeal.history[0].status,'resolved'); assert.equal(appeal.history[0].fromStatus,'progress'); assert.equal(appeal.history[0].version,3);
});

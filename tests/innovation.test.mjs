import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

async function loadPureTS(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}});
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {estimateImpact, detectRoute, findSimilarAppeals, addSupport, reportedCount, slaWaitingHours, requestEscalation, recordEffect, confirmResult, combineTranscript, buildComposeUrl} = await loadPureTS('../src/lib/innovation.ts');
const {qrPath} = await loadPureTS('../src/lib/qr.ts');
const now = Date.UTC(2026, 10, 11);
const appeal = (overrides = {}) => ({id: 'A-003', title: 'Разные версии инструкций', description: 'Нужен единый каталог актуальных инструкций для монтажников.', kind: 'problem', status: 'new', author: 'Марат Ахметов', createdAt: now - 20 * 3600000, updatedAt: now, firstResponseHours: null, comments: [], history: [], ...overrides});

test('ROI formula: exact tenge, editable zero rate, bounded finite inputs', () => {
  const base = {minutesPerDay: 15, employees: 25, hourlyRate: 2500, workdays: 247};
  assert.deepEqual(estimateImpact(base), {hoursYear: 1543.75, moneyYear: 3859375});
  assert.equal(estimateImpact({...base, hourlyRate: 0}).moneyYear, 0);
  for (const change of [{minutesPerDay: 4}, {employees: 151}, {employees: 1.5}, {hourlyRate: -1}, {workdays: 367}, {workdays: NaN}]) assert.throws(() => estimateImpact({...base, ...change}));
});
test('routing has evidence, recognizes procurement and IT, avoids ambiguous claims', () => {
  assert.equal(detectRoute('Закупки: поставщик задержал поставку кабеля').officer, 'Анна Смирнова');
  assert.equal(detectRoute('Ошибка программы, сервер не даёт доступ').department, 'IT');
  assert.equal(detectRoute('Нужен ремонт: монтаж').department, 'Монтаж и сервис');
  assert.equal(detectRoute('Спасибо за помощь коллегам'), null);
  assert.equal(detectRoute('Закупки и сервер'), null);
});
test('duplicate search matches concepts, rejects unrelated text and praise', () => {
  const items = [appeal(), appeal({id: 'A-018', kind: 'praise'})];
  assert.equal(findSimilarAppeals('Невозможно найти инструкции и актуальную версию памятки', items)[0].appeal.id, 'A-003');
  assert.equal(findSimilarAppeals('Хочу парковку около офиса', items).length, 0);
  assert.equal(findSimilarAppeals('abc', items).length, 0);
  assert.equal(findSimilarAppeals('Инструкции', items).some(item => item.appeal.kind === 'praise'), false);
});
test('support is immutable and idempotent across repeated clicks', () => {
  const original = appeal();
  const updated = addSupport(original);
  assert.equal(original.supporterIds, undefined);
  assert.equal(reportedCount(updated), 2);
  assert.equal(addSupport(updated), updated);
  assert.equal(reportedCount(addSupport(updated, 'another-employee')), 3);
  const own = appeal({author: 'Алия Касымова'});
  assert.equal(addSupport(own), own);
});
test('SLA uses first human reply and strict >18h boundary, not latest update', () => {
  assert.equal(slaWaitingHours(appeal(), now), 20);
  assert.equal(slaWaitingHours(appeal({createdAt: now - 18 * 3600000}), now), null);
  assert.equal(slaWaitingHours(appeal({createdAt: now + 1000}), now), null);
  for (const status of ['resolved', 'closed', 'rejected']) assert.equal(slaWaitingHours(appeal({status}), now), null);
  assert.equal(slaWaitingHours(appeal({firstResponseHours: 4}), now), null);
  assert.equal(slaWaitingHours(appeal({comments: [{author: 'Исполнитель'}]}), now), null);
  assert.equal(slaWaitingHours(appeal({comments: [{author: 'Марат Ахметов'}]}), now), 20);
});
test('escalation enqueues once and does not fabricate external delivery', () => {
  const original = appeal();
  const queued = requestEscalation(original, now);
  assert.equal(queued.escalation.requestedAt, now);
  assert.equal(queued.escalation.processedAt, undefined);
  assert.equal(requestEscalation(queued, now + 10), queued);
  const completed = appeal({status: 'closed'});
  assert.equal(requestEscalation(completed, now), completed);
});
test('interim transcript replacement does not append previous interim results', () => {
  assert.equal(combineTranscript('До записи.', ['Нужны', 'инструкции']), 'До записи. Нужны инструкции');
  assert.equal(combineTranscript('До записи.', ['Нужны новые', 'инструкции']), 'До записи. Нужны новые инструкции');
  assert.equal(combineTranscript('', ['  ', 'Текст']), 'Текст');
  assert.equal(combineTranscript('a'.repeat(10000), ['more']).length, 10000);
});
test('changed measurements require author confirmation again, preserving forecast separately', () => {
  const original = appeal({author: 'Алия Касымова', status: 'closed', result: 'Результат подтверждён автором.', estimate: {minutesPerDay: 15, employees: 25, hourlyRate: 2500, workdays: 247}});
  const measured = recordEffect(original, {hoursPerMonth: 32, evidence: 'Сравнение до и после за месяц.'}, now);
  assert.equal(measured.status, 'resolved');
  assert.equal(measured.result, 'Ожидаем подтверждение автора.');
  assert.equal(measured.measurement.hoursPerMonth, 32);
  assert.deepEqual(measured.estimate, original.estimate);
  assert.equal(confirmResult(measured, now, 'Другой сотрудник'), measured);
  const confirmed = confirmResult(measured, now + 1);
  assert.equal(confirmed.status, 'closed');
  assert.equal(confirmed.result, 'Результат подтверждён автором.');
  assert.equal(confirmResult(confirmed, now + 2), confirmed);
  assert.equal(recordEffect(confirmed, {hoursPerMonth: 16, evidence: 'Повторный замер за месяц.'}, now + 3).status, 'resolved');
  assert.throws(() => recordEffect(original, {hoursPerMonth: NaN, evidence: 'Достаточно текста.'}, now));
});
test('QR compose links roundtrip Cyrillic context and reject unsafe schemes', () => {
  const url = new URL(buildComposeUrl('https://dauys.example/app/?old=1#secret', {category: 'Интеграции и IT', department: 'IT'}));
  assert.equal(url.pathname, '/app/');
  assert.equal(url.searchParams.get('compose'), '1');
  assert.equal(url.searchParams.get('category'), 'Интеграции и IT');
  assert.equal(url.searchParams.get('department'), 'IT');
  assert.equal(url.searchParams.has('old'), false);
  assert.equal(url.hash, '');
  for (const value of ['javascript:alert(1)', 'file:///tmp/x', 'https://name:pass@example.com', 'not a URL']) assert.throws(() => buildComposeUrl(value, {}));
});
test('actual SVG path decodes independently to the exact QR URL', () => {
  const payload = buildComposeUrl('https://dauys.example/', {category: 'Межотдельное взаимодействие', department: 'Закупки'});
  const qr = QRCode.create(payload, {errorCorrectionLevel: 'M'});
  const {path, viewBox} = qrPath(qr.modules.size, qr.modules.data);
  const modules = qr.modules.size + 8, scale = 6, width = modules * scale;
  assert.equal(viewBox, `0 0 ${modules} ${modules}`);
  const rgba = new Uint8ClampedArray(width * width * 4).fill(255);
  const cells = [...path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)];
  for (const [, x, y] of cells) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
    const index = ((Number(y) * scale + dy) * width + Number(x) * scale + dx) * 4;
    rgba[index] = 14; rgba[index + 1] = 23; rgba[index + 2] = 45;
  }
  assert.equal(jsQR(rgba, width, width)?.data, payload);
});

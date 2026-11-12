import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const transpile = source => ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
}).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const typesUrl = url(transpile(await readFile(new URL('../src/types.ts', import.meta.url), 'utf8')));
const dynamicsSource = transpile(await readFile(new URL('../src/lib/appealDynamics.ts', import.meta.url), 'utf8'))
  .replace(/from ['"]\.\.\/types['"]/g, `from ${JSON.stringify(typesUrl)}`);
const {appealStatusAt, buildAppealDynamics, buildMonthlyAppealDynamics, filterMapAppeals, sortMapAppeals} = await import(url(dynamicsSource));
const calendarSource = transpile(await readFile(new URL('../src/lib/appealCalendar.ts', import.meta.url), 'utf8'));
const {selectAnalyticsAppeals} = await import(url(calendarSource));
const DAY = 86_400_000;
const now = Date.parse('2026-11-12T12:00:00+05:00');
const make = (id, changes = {}) => ({
  id, title: id, description: '', category: 'Процессы', department: 'IT', kind: 'problem',
  status: 'progress', priority: 'medium', author: 'Автор', assignee: 'Команда',
  createdAt: now - 3 * DAY, updatedAt: now - 2 * DAY, dueAt: now + DAY,
  firstResponseHours: null, result: '', comments: [],
  history: [{status: 'new', createdAt: now - 3 * DAY}, {status: 'progress', createdAt: now - 2 * DAY}],
  ...changes,
});

test('bar cohorts conserve all 20 source appeals and solutions across period/department filters', async () => {
  const seed = JSON.parse(await readFile(new URL('../src/data/seed.json', import.meta.url), 'utf8'));
  const appeals = seed.map((item, i) => make(`A-${i}`, {...item, createdAt: now - (20 - i) * DAY, history: []}));
  for (const periodDays of [0, 7, 30]) {
    for (const department of ['', ...new Set(appeals.map(item => item.department))]) {
      const selected = selectAnalyticsAppeals(appeals, {now, periodDays, department});
      const result = buildAppealDynamics(selected, now, periodDays);
      assert.equal(result.points.reduce((sum, point) => sum + point.received, 0), selected.length);
      assert.equal(result.points.reduce((sum, point) => sum + point.withSolution, 0),
        selected.filter(item => ['resolved', 'closed'].includes(item.status) && item.kind !== 'praise').length);
      assert.ok(result.points.every(point => point.withSolution <= point.received));
      assert.equal(result.average, selected.length / result.points.length);
      assert.equal(result.peak, Math.max(...result.points.map(point => point.received)));
    }
  }
});

test('status history reconstructs waiting, resolution and reopening without leaking current status backwards', () => {
  const createdAt = now - 5 * DAY;
  const item = make('history', {createdAt, updatedAt: createdAt + 4 * DAY, history: [
    {status: 'new', createdAt},
    {status: 'progress', createdAt: createdAt + DAY},
    {status: 'waiting', createdAt: createdAt + 2 * DAY},
    {status: 'resolved', createdAt: createdAt + 3 * DAY},
    {status: 'progress', createdAt: createdAt + 4 * DAY},
    {status: 'closed', createdAt: now + DAY},
  ]});
  assert.equal(appealStatusAt(item, createdAt - 1), null);
  assert.equal(appealStatusAt(item, createdAt + DAY / 2), 'new');
  assert.equal(appealStatusAt(item, createdAt + 2.5 * DAY), 'waiting');
  assert.equal(appealStatusAt(item, createdAt + 3.5 * DAY), 'resolved');
  assert.equal(appealStatusAt(item, now), 'progress');
  const points = buildAppealDynamics([item], now, 7).points;
  assert.ok(points.some(point => point.waiting === 1));
  assert.equal(points.at(-1).queue, 1);
  assert.equal(points.at(-1).waiting, 0);
});

test('bucket boundaries count each creation exactly once, including the final instant', () => {
  const start = now - 7 * DAY;
  const items = [0, 1, 2, 7].map((offset, i) => make(String(i), {createdAt: start + offset * DAY}));
  const result = buildAppealDynamics(items, now, 7);
  assert.equal(result.points.length, 7);
  assert.deepEqual(result.points.map(point => point.received), [1, 1, 1, 0, 0, 0, 1]);
  assert.equal(new Set(result.points.map(point => point.month)).size, 7);
  assert.equal(result.points.at(-1).date.getTime(), now);
});

test('last queue snapshot partitions all unfinished selected records without treating praise as a solution', () => {
  const items = [
    make('active'), make('waiting', {status: 'waiting'}),
    make('resolved', {status: 'resolved'}), make('closed', {status: 'closed'}),
    make('rejected', {status: 'rejected'}), make('thanks', {kind: 'praise', status: 'closed'}),
  ];
  const result = buildAppealDynamics(items, now, 30);
  assert.equal(result.points.at(-1).queue, 1);
  assert.equal(result.points.at(-1).waiting, 1);
  assert.equal(result.points.reduce((sum, point) => sum + point.withSolution, 0), 2);
});

test('empty and multi-year slices keep finite, bounded chart data and zero factual benchmarks', () => {
  const empty = buildAppealDynamics([], now, 0);
  assert.equal(empty.average, 0);
  assert.equal(empty.peak, 0);
  assert.ok(empty.points.every(point => point.received === 0 && point.queue === 0 && point.waiting === 0));
  const result = buildAppealDynamics([make('old', {createdAt: now - 800 * DAY})], now, 0);
  assert.equal(result.points.length, 12);
  assert.equal(new Set(result.points.map(point => point.month)).size, 12);
  assert.ok(result.points.every(point => Number.isFinite(point.date.getTime())));
});

test('map modes preserve pending records and exclude completed records from overdue attention', () => {
  const items = [
    make('late', {dueAt: now - 1}), make('exact', {dueAt: now}),
    make('waiting', {status: 'waiting', dueAt: now - 1}),
    make('resolved', {status: 'resolved', dueAt: now - DAY}),
    make('closed', {status: 'closed', dueAt: now - DAY}),
    make('rejected', {status: 'rejected', dueAt: now - DAY}),
  ];
  assert.equal(filterMapAppeals(items, 'all', now).length, 6);
  assert.deepEqual(filterMapAppeals(items, 'open', now).map(item => item.id), ['late', 'exact', 'waiting']);
  assert.deepEqual(filterMapAppeals(items, 'overdue', now).map(item => item.id), ['late', 'waiting']);
});

test('cell drilldown retains every record, prioritises overdue work and leaves source order intact', () => {
  const items = [
    make('closed-high', {status: 'closed', priority: 'high'}),
    make('open-high', {priority: 'high'}),
    make('late-low', {priority: 'low', dueAt: now - 1}),
    make('open-low', {priority: 'low'}),
  ];
  const original = items.map(item => item.id);
  assert.deepEqual(sortMapAppeals(items, now).map(item => item.id), ['late-low', 'open-high', 'open-low', 'closed-high']);
  assert.deepEqual(items.map(item => item.id), original);
});

test('monthly dynamics use Qyzylorda month boundaries and preserve actual cohorts', () => {
  const items = [
    make('oct', {createdAt: Date.parse('2026-10-31T18:59:59Z'), status: 'resolved'}),
    make('nov', {createdAt: Date.parse('2026-10-31T19:00:00Z')}),
    make('today', {createdAt: now, kind: 'praise', status: 'closed'}),
  ];
  const result = buildMonthlyAppealDynamics(items, now, 30);
  assert.equal(result.points.length, 2);
  assert.deepEqual(result.points.map(point => point.received), [1, 2]);
  assert.deepEqual(result.points.map(point => point.withSolution), [1, 0]);
  assert.equal(result.points[0].date.toISOString(), '2026-10-31T18:59:59.999Z');
  assert.equal(result.points[1].date.getTime(), now);
  assert.equal(result.average, 1.5);
  assert.equal(result.peak, 2);
});

test('monthly overview conserves the full source dataset across filters, including empty months', async () => {
  const seed = JSON.parse(await readFile(new URL('../src/data/seed.json', import.meta.url), 'utf8'));
  const items = seed.map((item, i) => make(`A-${i}`, {...item, createdAt: now - (20 - i) * DAY}));
  for (const periodDays of [0, 7, 30, 180]) {
    for (const department of ['', ...new Set(items.map(item => item.department))]) {
      const selected = selectAnalyticsAppeals(items, {now, periodDays, department});
      const result = buildMonthlyAppealDynamics(selected, now, periodDays);
      assert.equal(result.points.reduce((sum, point) => sum + point.received, 0), selected.length);
      assert.equal(result.points.reduce((sum, point) => sum + point.withSolution, 0), selected.filter(item => ['resolved', 'closed'].includes(item.status) && item.kind !== 'praise').length);
      assert.equal(new Set(result.points.map(point => point.month)).size, result.points.length);
    }
  }
  assert.ok(buildMonthlyAppealDynamics([], now, 180).points.every(point => point.received === 0));
});

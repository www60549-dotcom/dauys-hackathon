import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/appealCalendar.ts', import.meta.url), 'utf8');
const {outputText} = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
const {buildAppealCalendar, selectAnalyticsAppeals, formatAppealCount} = await import(moduleUrl);
const now = Date.parse('2026-11-12T12:00:00+05:00');
const dayMs = 86_400_000;
const cells = calendar => calendar.columns.flatMap(column => column.bins);
const dateKey = date => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

test('the original 20-record dataset is conserved across the calendar and department slices', async () => {
  const seed = JSON.parse(await readFile(new URL('../src/data/seed.json', import.meta.url), 'utf8'));
  assert.equal(seed.length, 20);
  const appeals = seed.map((item, i) => ({...item, createdAt: now - (20 - i) * dayMs}));
  for (const department of ['', ...new Set(seed.map(item => item.department))]) {
    for (const periodDays of [0, 7, 30]) {
      const selected = selectAnalyticsAppeals(appeals, {now, periodDays, department});
      const calendar = buildAppealCalendar(selected, now);
      assert.equal(calendar.total, selected.length);
      assert.equal(cells(calendar).reduce((sum, cell) => sum + cell.count, 0), selected.length);
      assert.equal(calendar.earlierCount, 0);
    }
  }
});

test('creation instants are grouped at midnight in Qyzylorda; later updates are not new appeals', () => {
  const appeals = [
    {createdAt: Date.parse('2026-11-11T18:59:59Z'), updatedAt: now},
    {createdAt: Date.parse('2026-11-11T19:00:00Z'), updatedAt: now},
    {createdAt: Date.parse('2026-11-11T19:00:01Z'), updatedAt: now},
  ];
  const active = cells(buildAppealCalendar(appeals, now)).filter(cell => cell.count);
  assert.deepEqual(active.map(cell => [dateKey(cell.date), cell.count]), [
    ['2026-11-11', 1], ['2026-11-12', 2],
  ]);
});

test('rolling filters include the exact lower boundary and reject future or invalid dates', () => {
  const appeals = [
    {id: 'before', department: 'IT', createdAt: now - 7 * dayMs - 1},
    {id: 'boundary', department: 'IT', createdAt: now - 7 * dayMs},
    {id: 'now', department: 'IT', createdAt: now},
    {id: 'future', department: 'IT', createdAt: now + 1},
    {id: 'other', department: 'Закупки', createdAt: now},
    {id: 'invalid', department: 'IT', createdAt: NaN},
    {id: 'out-of-range', department: 'IT', createdAt: -1e20},
  ];
  assert.deepEqual(selectAnalyticsAppeals(appeals, {now, periodDays: 7, department: 'IT'}).map(item => item.id), ['boundary', 'now']);
  assert.equal(appeals.length, 7);
});

test('calendar month boundary reports older records separately and never invents events', () => {
  const appeals = [
    {createdAt: Date.parse('2025-11-30T18:59:59Z')},
    {createdAt: Date.parse('2025-11-30T19:00:00Z')},
    {createdAt: now}, {createdAt: now + 1}, {createdAt: NaN},
  ];
  const calendar = buildAppealCalendar(appeals, now);
  assert.equal(dateKey(calendar.start), '2025-12-1');
  assert.equal(dateKey(calendar.end), '2026-11-12');
  assert.equal(calendar.total, 2);
  assert.equal(calendar.earlierCount, 1);
  assert.equal(cells(calendar).reduce((sum, cell) => sum + cell.count, 0), 2);
});

test('empty and leap-year calendars contain complete chronological weeks without missing days', () => {
  const leapNow = Date.parse('2024-03-01T12:00:00+05:00');
  const calendar = buildAppealCalendar([{createdAt: Date.parse('2024-02-29T12:00:00+05:00')}], leapNow);
  const all = cells(calendar);
  const ordinal = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  assert.ok(calendar.columns.length >= 47 && calendar.columns.length <= 54);
  for (const column of calendar.columns) {
    assert.equal(column.bins.length, 7);
    column.bins.forEach((cell, i) => assert.equal(cell.date.getDay(), i));
  }
  for (let i = 1; i < all.length; i++) assert.equal(ordinal(all[i].date) - ordinal(all[i - 1].date), dayMs);
  const leapDay = all.find(cell => dateKey(cell.date) === '2024-2-29');
  assert.equal(leapDay.count, 1);
  assert.equal(leapDay.bin, 4);
  assert.ok(cells(buildAppealCalendar([], now)).every(cell => cell.count === 0));
  assert.throws(() => buildAppealCalendar([], NaN), RangeError);
});

test('company-day grouping remains the same in different browser/system time zones', () => {
  const script = `
    const {buildAppealCalendar} = await import(${JSON.stringify(moduleUrl)});
    const result = buildAppealCalendar([
      {createdAt: Date.parse('2026-11-11T18:59:59Z')},
      {createdAt: Date.parse('2026-11-11T19:00:00Z')},
    ], ${now});
    console.log(JSON.stringify(result.columns.flatMap(c => c.bins).filter(c => c.count)
      .map(c => [c.date.getFullYear(), c.date.getMonth()+1, c.date.getDate(), c.bin, c.count])));
  `;
  for (const TZ of ['UTC', 'America/Los_Angeles', 'Europe/Berlin', 'Asia/Almaty']) {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: {...process.env, TZ}, encoding: 'utf8',
    });
    assert.deepEqual(JSON.parse(output), [[2026, 11, 11, 3, 1], [2026, 11, 12, 4, 1]], TZ);
  }
});

test('appeal labels use Russian plural forms rather than contributions or synthetic activity', () => {
  assert.deepEqual([0, 1, 2, 5, 11, 21, 22].map(formatAppealCount), [
    '0 обращений', '1 обращение', '2 обращения', '5 обращений', '11 обращений', '21 обращение', '22 обращения',
  ]);
});

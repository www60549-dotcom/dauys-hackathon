import {isCompleted, type Appeal, type Status} from '../types';

const DAY = 86_400_000;
const dateLabel = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'short', timeZone: 'Asia/Qyzylorda'});
const longDateLabel = new Intl.DateTimeFormat('ru-RU', {month: 'short', year: '2-digit', timeZone: 'Asia/Qyzylorda'});

export type AppealDynamicsPoint = {
  date: Date;
  month: string;
  received: number;
  withSolution: number;
  queue: number;
  waiting: number;
};

/** Reconstruct only known states; current status must not leak into earlier dates. */
export function appealStatusAt(appeal: Appeal, at: number): Status | null {
  if (appeal.createdAt > at) return null;
  let latestTime = Number.NEGATIVE_INFINITY;
  let status: Status = 'new';
  for (const entry of appeal.history) {
    if (entry.createdAt >= appeal.createdAt && entry.createdAt <= at && entry.createdAt >= latestTime) {
      latestTime = entry.createdAt;
      status = entry.status;
    }
  }
  if (appeal.updatedAt <= at && appeal.updatedAt >= latestTime) return appeal.status;
  return status;
}

/** Bars are creation cohorts; queue lines are historical snapshots of that same slice. */
export function buildAppealDynamics(items: readonly Appeal[], now: number, periodDays: number) {
  const start = periodDays ? now - periodDays * DAY
    : Math.min(now - 30 * DAY, ...items.map(item => item.createdAt));
  const span = Math.max(1, now - start);
  const count = Math.min(12, Math.max(2, Math.ceil(span / DAY)));
  const format = span > 366 * DAY ? longDateLabel : dateLabel;
  const points: AppealDynamicsPoint[] = Array.from({length: count}, (_, i) => ({
    date: new Date(start + span * (i + 1) / count),
    month: format.format(start + span * i / count),
    received: 0, withSolution: 0, queue: 0, waiting: 0,
  }));
  for (const item of items) {
    const index = Math.max(0, Math.min(count - 1, Math.floor((item.createdAt - start) / span * count)));
    points[index].received++;
    if (item.kind !== 'praise' && ['resolved', 'closed'].includes(item.status)) points[index].withSolution++;
    for (const point of points) {
      const status = appealStatusAt(item, point.date.getTime());
      if (status === null || isCompleted(status)) continue;
      if (status === 'waiting') point.waiting++;
      else point.queue++;
    }
  }
  const average = items.length / count;
  const peak = Math.max(0, ...points.map(point => point.received));
  return {points, average, peak};
}

const monthCalendar = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Qyzylorda', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function monthIndex(timestamp: number) {
  const parts = monthCalendar.formatToParts(timestamp);
  return Number(parts.find(part => part.type === 'year')!.value) * 12
    + Number(parts.find(part => part.type === 'month')!.value) - 1;
}

function monthStart(index: number) {
  const desired = Date.UTC(Math.floor(index / 12), index % 12, 1);
  let instant = desired;
  for (let i = 0; i < 2; i++) {
    const parts = monthCalendar.formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)!.value);
    const observed = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
    instant += desired - observed;
  }
  return instant;
}

/** Actual calendar months in the company time zone, including months without events. */
export function buildMonthlyAppealDynamics(items: readonly Appeal[], now: number, periodDays: number) {
  const from = periodDays ? now - periodDays * DAY : Math.min(now - 30 * DAY, ...items.map(item => item.createdAt));
  const first = monthIndex(from);
  const last = monthIndex(now);
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    month: 'short', ...(Math.floor(first / 12) !== Math.floor(last / 12) ? {year: '2-digit' as const} : {}), timeZone: 'Asia/Qyzylorda',
  });
  const points: AppealDynamicsPoint[] = Array.from({length: last - first + 1}, (_, i) => ({
    month: formatter.format(monthStart(first + i)), date: new Date(Math.min(now, monthStart(first + i + 1) - 1)),
    received: 0, withSolution: 0, queue: 0, waiting: 0,
  }));
  for (const item of items) {
    const index = monthIndex(item.createdAt) - first;
    if (index < 0 || index >= points.length || item.createdAt > now) continue;
    points[index].received++;
    if (item.kind !== 'praise' && ['resolved', 'closed'].includes(item.status)) points[index].withSolution++;
    for (const point of points) {
      const status = appealStatusAt(item, point.date.getTime());
      if (status === null || isCompleted(status)) continue;
      if (status === 'waiting') point.waiting++;
      else point.queue++;
    }
  }
  return {points, average: items.length / points.length, peak: Math.max(0, ...points.map(point => point.received))};
}

export type MapMode = 'all' | 'open' | 'overdue';
export const isAppealOverdue = (item: Appeal, now: number) => !isCompleted(item.status) && item.dueAt < now;

export function filterMapAppeals(items: readonly Appeal[], mode: MapMode, now: number) {
  return items.filter(item => mode === 'all' || (mode === 'open' ? !isCompleted(item.status) : isAppealOverdue(item, now)));
}

/** Stable, actionable ordering for the entire selected cell, without mutating source records. */
export function sortMapAppeals(items: readonly Appeal[], now: number) {
  const priority = (value: string) => value === 'high' ? 2 : value === 'medium' ? 1 : 0;
  return [...items].sort((a, b) => Number(isAppealOverdue(b, now)) - Number(isAppealOverdue(a, now))
    || Number(isCompleted(a.status)) - Number(isCompleted(b.status))
    || priority(b.priority) - priority(a.priority)
    || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

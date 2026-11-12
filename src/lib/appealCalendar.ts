import type {HeatmapColumn} from '@/components/charts/heatmap/heatmap-context';
import type {Appeal} from '../types';

export const ANALYTICS_TIME_ZONE = 'Asia/Qyzylorda';
const DAY_MS = 86_400_000;
const companyDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: ANALYTICS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const plural = new Intl.PluralRules('ru');
type DatedAppeal = Pick<Appeal, 'createdAt'>;
interface AnalyticsSelection {now: number; periodDays: number; department: string}

/** One shared time/department slice for metrics, the matrix and the calendar. */
export function selectAnalyticsAppeals<T extends DatedAppeal & Pick<Appeal, 'department'>>(
  appeals: readonly T[], {now, periodDays, department}: AnalyticsSelection,
): T[] {
  if (!Number.isFinite(now) || !Number.isFinite(periodDays) || periodDays < 0) {
    throw new RangeError('Invalid analytics interval');
  }
  const from = periodDays ? now - periodDays * DAY_MS : Number.NEGATIVE_INFINITY;
  return appeals.filter(item => Number.isFinite(item.createdAt)
    && !Number.isNaN(new Date(item.createdAt).getTime())
    && item.createdAt >= from && item.createdAt <= now
    && (!department || item.department === department));
}

/** Project an instant onto a civil calendar day in the company's time zone. */
function calendarDay(timestamp: number): Date {
  const parts = companyDate.formatToParts(timestamp);
  const part = (name: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === name)!.value);
  return new Date(part('year'), part('month') - 1, part('day'));
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export interface AppealCalendarData {
  columns: HeatmapColumn[];
  start: Date;
  end: Date;
  total: number;
  earlierCount: number;
}

/**
 * Twelve calendar months, matching Studio's contribution-grid shape.
 * Each record contributes once, on creation day. Comments, votes and status
 * changes are not new appeals. Missing days stay zero; older records are
 * reported separately rather than discarded without an explanation.
 */
export function buildAppealCalendar(appeals: readonly DatedAppeal[], now: number): AppealCalendarData {
  if (!Number.isFinite(now) || Number.isNaN(new Date(now).getTime())) {
    throw new RangeError('Invalid calendar date');
  }
  const end = calendarDay(now);
  const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
  const firstSunday = new Date(start);
  firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());
  const lastSaturday = new Date(end);
  lastSaturday.setDate(lastSaturday.getDate() + 6 - lastSaturday.getDay());
  const counts = new Map<string, number>();
  let total = 0;
  let earlierCount = 0;

  for (const appeal of appeals) {
    if (!Number.isFinite(appeal.createdAt) || appeal.createdAt > now
      || Number.isNaN(new Date(appeal.createdAt).getTime())) continue;
    const day = calendarDay(appeal.createdAt);
    if (day < start) { earlierCount++; continue; }
    if (day > end) continue;
    const key = dateKey(day);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  }

  const columns: HeatmapColumn[] = [];
  const day = new Date(firstSunday);
  while (day <= lastSaturday) {
    const bins = Array.from({length: 7}, (_, bin) => {
      const date = new Date(day);
      day.setDate(day.getDate() + 1);
      return {bin, date, count: counts.get(dateKey(date)) ?? 0};
    });
    columns.push({bin: columns.length, bins});
  }
  return {columns, start, end, total, earlierCount};
}

export function formatAppealCount(count: number): string {
  const forms = {one: 'обращение', few: 'обращения'};
  const form = plural.select(count);
  return `${count} ${forms[form as keyof typeof forms] ?? 'обращений'}`;
}

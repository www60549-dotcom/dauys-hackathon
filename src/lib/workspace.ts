import type {Appeal} from '../types';

export const DEMO_EMPLOYEE = {
  name: 'Алия Касымова', firstName: 'Алия', department: 'Закупки', email: 'employee@dauys.local', initials: 'АК',
} as const;

export function employeeAppeals(appeals: readonly Appeal[], name: string): Appeal[] {
  return appeals.filter(item => item.author === name)
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

export function activeEmployeeAppeals(appeals: readonly Appeal[], name: string): Appeal[] {
  // A prepared solution still needs the author's confirmation, so it remains actionable.
  return employeeAppeals(appeals, name).filter(item => !['closed', 'rejected'].includes(item.status));
}

/** Category groups are signals for human review, not an assertion of identical causes. */
export function repeatedProblemGroups(appeals: readonly Appeal[]) {
  const groups = new Map<string, Appeal[]>();
  for (const item of appeals) {
    if (item.kind !== 'problem') continue;
    const group = groups.get(item.category) ?? [];
    group.push(item);
    groups.set(item.category, group);
  }
  return [...groups].map(([category, items]) => ({
    category, items,
    supporters: new Set(items.flatMap(item => item.supporterIds ?? [])).size,
  })).filter(group => group.items.length > 1 || group.supporters > 0)
    .sort((a, b) => b.items.length - a.items.length || b.supporters - a.supporters || a.category.localeCompare(b.category, 'ru'));
}

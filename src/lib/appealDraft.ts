import type {ApiAppeal, EditAppealInput, ManageAppealInput} from '../api/contracts';

export interface AppealDraft extends ManageAppealInput {id: string; title: string; description: string; solution: string; reopen_reason: string; dirty: boolean}

export function createAppealDraft(item: ApiAppeal): AppealDraft {
  return {id: item.id, expected_version: item.version, status: item.status, priority: item.priority, assignee_id: item.assignee_id,
    parent_id: item.parent_id, result: item.result, actual_effect: item.actual_effect, due_at: item.due_at,
    title: item.title, description: item.description, solution: item.solution, reopen_reason: '', dirty: false};
}
export function reconcileAppealDraft(draft: AppealDraft | null, item?: ApiAppeal): AppealDraft | null {
  if (!item) return null;
  if (draft?.id === item.id && draft.dirty) return draft;
  return createAppealDraft(item);
}
export function isStaleDraft(draft: AppealDraft | null, item?: ApiAppeal): boolean {
  return !!draft && !!item && draft.id === item.id && draft.expected_version !== item.version;
}
export function toManageInput(draft: AppealDraft): ManageAppealInput {
  const {expected_version, status, priority, assignee_id, parent_id, result, actual_effect, due_at} = draft;
  return {expected_version, status, priority, assignee_id, parent_id, result, actual_effect, due_at};
}
export function toEditInput(draft: AppealDraft): EditAppealInput {
  return {expected_version: draft.expected_version, title: draft.title.trim(), description: draft.description.trim(), solution: draft.solution.trim()};
}
export function dateForInput(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Qyzylorda', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(value));
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

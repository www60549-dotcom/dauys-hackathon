import {statusLabels, type Appeal, type Notification} from '../types';
import type {ApiAppeal, ApiNotification, AppealDetail} from './contracts';
export function apiDate(value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error('API вернул некорректную дату.');
  return timestamp;
}
export function toAppeal(item: ApiAppeal, detail?: AppealDetail): Appeal {
  if (!Object.hasOwn(statusLabels, item.status) || !['problem', 'idea', 'praise'].includes(item.kind)) throw new Error('API вернул неизвестный статус или тип обращения.');
  const firstReply = detail?.comments.find(comment => comment.author_id ? comment.author_id !== item.author_id : comment.name !== item.author);
  return {
    id: item.id, title: item.title, description: item.description, category: item.category, department: item.department,
    kind: item.kind, status: item.status, priority: item.priority, author: item.author, assignee: item.assignee,
    authorId: item.author_id, assigneeId: item.assignee_id, createdAt: apiDate(item.created_at), updatedAt: apiDate(item.updated_at), dueAt: apiDate(item.due_at),
    firstResponseHours: firstReply ? Math.max(0, (apiDate(firstReply.created_at) - apiDate(item.created_at)) / 3_600_000) : null,
    result: item.result, votes: item.votes, voted: item.voted, confirmed: item.confirmed,
    comments: detail?.comments.map(comment => ({id: String(comment.id), author: comment.name, body: comment.body, createdAt: apiDate(comment.created_at)})) ?? [],
    // Only explicit status events are used; imported text remains a neutral entry.
    history: detail?.history.map(entry => ({createdAt: apiDate(entry.created_at), label: entry.action, actor: entry.name, status: entry.to_status ?? undefined, fromStatus: entry.from_status ?? undefined, eventType: entry.event_type, version: entry.appeal_version ?? undefined})) ?? [],
  };
}
export function toNotification(item: ApiNotification): Notification {
  return {id: String(item.id), appealId: item.appeal_id, body: item.body, read: item.read_at !== null, createdAt: apiDate(item.created_at)};
}

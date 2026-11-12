import type {Kind, Status} from '../types';
export type Role = 'employee' | 'executor' | 'admin';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export interface SessionUser {id: string; name: string; email: string; role: Role; department: string}
export interface ApiImpact {people: number; minutes: number; occurrences_month: number; hourly_rate: number}
export interface ApiAppeal {
  version: number;
  id: string; title: string; description: string; solution: string; kind: Kind; category: string; department: string; priority: Priority; status: Status;
  author_id: string; author: string; assignee_id: string; assignee: string; parent_id: string; affected: number; expected_effect: number; actual_effect: number; result: string;
  due_at: string; created_at: string; updated_at: string; confirmed: boolean; votes: number; voted: boolean; score: number; recurrence_count: number; impact?: ApiImpact;
}
export interface ApiComment {id: number | string; body: string; created_at: string; name: string; role: Role; author_id?: string}
export interface ApiHistory {id: number | string; action: string; created_at: string; name: string; actor_id: string; event_type: string; from_status: Status | null; to_status: Status | null; appeal_version: number | null; details: {fields?: string[]; previous_version?: number; [key: string]: unknown}}
export interface ApiAttachment {id: string; name: string; size: number}
export interface AppealDetail {appeal: ApiAppeal; comments: ApiComment[]; history: ApiHistory[]; files: ApiAttachment[]; linked: {id: string; title: string; affected: number}[]; allowed_transitions: Status[]; permissions: {can_edit: boolean; can_manage: boolean; can_comment: boolean}}
export interface AppealPage {items: ApiAppeal[]; total: number; page: number; counts: {total: number; active: number; progress: number; waiting: number; resolved: number}}
export interface Metadata {categories: {name: string; assignee_id: string}[]; executors: Pick<SessionUser, 'id' | 'name' | 'role' | 'department'>[]; departments?: string[]}
export interface ApiNotification {id: number | string; appeal_id: string; body: string; read_at: string | null; created_at: string}
export interface AppealFilters {q?: string; status?: Status | 'done' | 'active'; department?: string; kind?: Kind; mine?: string; assigned?: string; page?: number; sort?: string; overdue?: string}
export interface CreateAppealInput {title: string; description: string; solution?: string; kind: Kind; category: string; department: string; priority: Priority; affected: number; expected_effect: number; impact?: ApiImpact}
export interface ManageAppealInput {expected_version: number; status: Status; priority: Priority; assignee_id: string; parent_id: string; result: string; actual_effect: number; due_at: string}
export interface EditAppealInput {expected_version: number; title: string; description: string; solution: string}
export interface UpdateAppealResult {ok: true; version: number}
export interface Dashboard {
  summary: {total: number; resolved: number; closed: number; waiting: number; overdue: number; confirmed_effect: number; expected_effect: number; average_days: number; first_response_hours: number | null; first_response_count: number; implemented: number};
  trend: {week: number; total: number; resolved: number}[];
  departments: {department: string; total: number; resolved: number; critical: number; overdue: number}[];
  types: {kind: Kind; total: number}[];
  heatmap: {department: string; topic: string; score: number; total: number}[];
  recurring: {id: string; title: string; affected: number; score: number; total: number}[];
  top_idea: {id: string; title: string; votes: number} | null;
  insights: {impact: {assessed_topics: number; hours_month: number; cost_month: number}; top_loss: {id: string; title: string; department: string; hours_month: number; cost_month: number}[]; pilots: {running: number; evaluated: number; goals_met: number}; recurrences: {appeals: number; events: number}};
}

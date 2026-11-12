import type {Kind, Status} from '../types';
export type Role = 'employee' | 'executor' | 'admin';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export interface SessionUser {id: string; name: string; email: string; role: Role; department: string}
export interface ApiImpact {people: number; minutes: number; occurrences_month: number; hourly_rate: number}
export interface SLA {response_due_at:string;resolution_due_at:string;first_response_at:string|null;last_escalation_at:string|null;next_reminder_at:string|null;response_overdue:boolean;resolution_overdue:boolean;waiting_for_author:boolean;can_remind:boolean;reason:string}
export interface SavedImpact extends ApiImpact {hours_month: number; cost_month: number; updated_at: string}
export interface PilotPlan {hypothesis: string; scope: string; metric: string; unit: string; baseline: number; target: number; direction: 'decrease' | 'increase'; owner_id: string; end_at: string}
export interface Pilot extends PilotPlan {id: number; version: number; owner: string; state: 'planned' | 'running' | 'evaluated'; actual: number | null; conclusion: string; goal_met: boolean | null; created_at: string; started_at: string | null; evaluated_at: string | null}
export type PilotCommand = {expected_appeal_version: number} & (
  {action: 'create'} & PilotPlan | {action: 'save'; id: number; version: number} & PilotPlan |
  {action: 'start'; id: number; version: number} | {action: 'finish'; id: number; version: number; actual: number; conclusion: string});
export interface BusinessFeatures {appeal_version: number; permissions: {can_assess: boolean; can_pilot: boolean}; impact: SavedImpact | null; pilots: Pilot[]; recurrences: {id: number; reason: string; previous_result: string; previous_effect: number; previous_confirmed_at: string | null; created_at: string; author: string}[]}
export interface SimilarAppeal {id: string; title: string; status: Status; category: string; department: string; score: number; reasons: string[]; method: string}
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
export interface Metadata {public_url?:string; categories: {name: string; assignee_id: string}[]; executors: Pick<SessionUser, 'id' | 'name' | 'role' | 'department'>[]; departments?: string[]}
export interface ApiNotification {id: number | string; appeal_id: string; body: string; read_at: string | null; created_at: string}
export interface AppealFilters {q?: string; status?: Status | 'done' | 'active'; department?: string; kind?: Kind; mine?: string; assigned?: string; page?: number; sort?: string; overdue?: string}
export interface CreateAppealInput {title: string; description: string; solution?: string; kind: Kind; category: string; department: string; priority: Priority; affected: number; expected_effect: number; impact?: ApiImpact}
export interface ManageAppealInput {expected_version: number; status: Status; priority: Priority; assignee_id: string; parent_id: string; result: string; actual_effect: number; due_at: string}
export interface EditAppealInput {expected_version: number; title: string; description: string; solution: string}
export interface UpdateAppealResult {ok: true; version: number}
export interface Dashboard {
  summary: {total: number; resolved: number; closed: number; waiting: number; overdue: number; confirmed_effect: number; expected_effect: number; average_days: number; first_response_hours: number | null; first_response_count: number; implemented: number; undated_legacy_resolutions: number};
  trend: {month: string; total: number; resolved: number}[];
  departments: {department: string; total: number; resolved: number; critical: number; overdue: number}[];
  types: {kind: Kind; total: number}[];
  heatmap: {department: string; topic: string; score: number; total: number}[];
  recurring: {id: string; title: string; affected: number; score: number; total: number}[];
  top_idea: {id: string; title: string; votes: number} | null;
  insights: {impact: {assessed_topics: number; hours_month: number; cost_month: number}; top_loss: {id: string; title: string; department: string; hours_month: number; cost_month: number}[]; pilots: {running: number; evaluated: number; goals_met: number}; recurrences: {appeals: number; events: number}};
}

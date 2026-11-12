import type {ApiNotification, AppealDetail, AppealFilters, AppealPage, CreateAppealInput, Dashboard, EditAppealInput, ManageAppealInput, Metadata, SessionUser, UpdateAppealResult} from './contracts';
export const SESSION_EXPIRED = 'dauys:session-expired';
export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string, public readonly currentVersion?: number) {super(message); this.name = 'ApiError';}
}
type RequestOptions = Omit<RequestInit, 'body'> & {body?: unknown};
/** Cookies stay in the browser; requests use one origin and writes never auto-retry. */
export async function request<T>(path: string, {body, headers, ...options}: RequestOptions = {}): Promise<T> {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Accept', 'application/json');
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) requestHeaders.set('Content-Type', 'application/json');
  let response: Response;
  try {response = await fetch(`/api${path}`, {...options, headers: requestHeaders, credentials: 'same-origin', body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)});}
  catch (error) {if (error instanceof Error && error.name === 'AbortError') throw error; throw new ApiError('Сервер недоступен. Проверьте подключение и повторите попытку.', 0);}
  const raw = await response.text();
  let payload: unknown;
  if (response.headers.get('content-type')?.includes('application/json') && raw) {
    try {payload = JSON.parse(raw);} catch {throw new ApiError('Сервер вернул некорректный ответ.', response.status);}
  }
  if (!response.ok) {
    if (response.status === 401 && path !== '/login' && path !== '/me' && typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED));
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : response.status === 401 ? 'Войдите в систему.' : `Не удалось выполнить запрос (${response.status}).`;
    const code = payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string' ? payload.code : undefined;
    const version = payload && typeof payload === 'object' && 'current_version' in payload && typeof payload.current_version === 'number' ? payload.current_version : undefined;
    throw new ApiError(message, response.status, code, version);
  }
  if (payload === undefined && (response.status === 204 || response.status === 201 && raw === 'Created')) return undefined as T;
  if (payload === undefined) throw new ApiError('Вместо данных API получен неожиданный ответ. Проверьте proxy.', response.status);
  return payload as T;
}
export function queryString(filters: object): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {if (value !== undefined && value !== '') params.set(key, String(value));});
  return params.size ? `?${params}` : '';
}
export const api = {
  me: (signal?: AbortSignal) => request<SessionUser>('/me', {signal}),
  login: (email: string, password: string) => request<{ok: true}>('/login', {method: 'POST', body: {email, password}}),
  logout: () => request<void>('/logout', {method: 'POST'}),
  meta: (signal?: AbortSignal) => request<Metadata>('/meta', {signal}),
  appeals: (filters: AppealFilters, signal?: AbortSignal) => request<AppealPage>(`/appeals${queryString(filters)}`, {signal}),
  detail: (id: string, signal?: AbortSignal) => request<AppealDetail>(`/appeals/${encodeURIComponent(id)}`, {signal}),
  create: (body: CreateAppealInput) => request<{id: string}>('/appeals', {method: 'POST', body}),
  edit: (id: string, body: EditAppealInput) => request<UpdateAppealResult>(`/appeals/${encodeURIComponent(id)}`, {method: 'PATCH', body: {...body, action: 'edit'}}),
  manage: (id: string, body: ManageAppealInput) => request<UpdateAppealResult>(`/appeals/${encodeURIComponent(id)}`, {method: 'PATCH', body: {...body, action: 'manage'}}),
  confirm: (id: string, expectedVersion: number) => request<UpdateAppealResult>(`/appeals/${encodeURIComponent(id)}`, {method: 'PATCH', body: {action: 'confirm', expected_version: expectedVersion}}),
  reopen: (id: string, reason: string, expectedVersion: number) => request<{ok: true}>(`/appeals/${encodeURIComponent(id)}/reopen`, {method: 'POST', body: {reason, expected_version: expectedVersion}}),
  comment: (id: string, body: string) => request<void>(`/appeals/${encodeURIComponent(id)}/comments`, {method: 'POST', body: {body}}),
  upload: (id: string, file: File) => {const body = new FormData(); body.set('file', file); return request<{id: string}>(`/appeals/${encodeURIComponent(id)}/files`, {method: 'POST', body});},
  notifications: (signal?: AbortSignal) => request<ApiNotification[]>('/notifications', {signal}),
  readNotifications: () => request<void>('/notifications/read', {method: 'POST'}),
  dashboard: (filters: {month?: string; department?: string}, signal?: AbortSignal) => request<Dashboard>(`/analytics${queryString(filters)}`, {signal}),
};

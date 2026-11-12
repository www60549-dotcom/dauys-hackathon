export type View = 'space' | 'appeals' | 'improvements' | 'analytics' | 'help';
export type Status = 'new' | 'review' | 'progress' | 'waiting' | 'resolved' | 'closed' | 'rejected';
export type Kind = 'problem' | 'idea' | 'praise';
export type CategoryId = 'procurement' | 'it' | 'engineering' | 'installation' | 'processes';

export interface ImpactEstimate {minutesPerDay: number; employees: number; hourlyRate: number; workdays: number}
export interface EffectMeasurement {hoursPerMonth: number; evidence: string; recordedAt: number}
export interface Escalation {requestedAt: number; processedAt?: number}
export interface Notification {id: string; appealId: string; body: string; createdAt: number; read: boolean}
export interface ComposeContext {category?: string; department?: string}

export interface Comment {
  id: string;
  author: string;
  body: string;
  createdAt: number;
}

export interface HistoryEntry {
  status: Status;
  createdAt: number;
  label?: string;
}

export interface Appeal {
  estimate?: ImpactEstimate;
  measurement?: EffectMeasurement;
  supporterIds?: string[];
  escalation?: Escalation;
  id: string;
  title: string;
  description: string;
  category: string;
  department: string;
  kind: Kind;
  status: Status;
  priority: string;
  author: string;
  assignee: string;
  createdAt: number;
  updatedAt: number;
  dueAt: number;
  firstResponseHours: number | null;
  result: string;
  comments: Comment[];
  history: HistoryEntry[];
}

export interface NewAppeal {
  estimate?: ImpactEstimate;
  title: string;
  description: string;
  category: string;
  department: string;
  kind: Kind;
}

export interface PointerState { x: number; y: number; active?: boolean }
export interface PointerRef { current: PointerState }

export const statusLabels: Record<Status, string> = {
  new: 'Новое', review: 'На рассмотрении', progress: 'В работе',
  waiting: 'Ожидает уточнения', resolved: 'Решено', closed: 'Подтверждено', rejected: 'Отклонено',
};
export const kindLabels: Record<Kind, string> = {
  problem: 'Проблема', idea: 'Предложение', praise: 'Отзыв',
};
export const departments = ['Закупки', 'Проектирование', 'Монтаж и сервис', 'Бухгалтерия', 'Продажи', 'IT', 'Офис'];
export const isCompleted = (status: Status) => ['resolved', 'closed', 'rejected'].includes(status);
export const displayStatus = (appeal: Pick<Appeal, 'kind' | 'status'>) =>
  appeal.kind === 'praise' && appeal.status === 'closed' ? 'Отзыв принят' : statusLabels[appeal.status];

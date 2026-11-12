import {useCallback, useEffect, useState} from 'react';
import seed from '../data/seed.json';
import {DAY} from '../lib/utils';
import {statusLabels, type Appeal, type NewAppeal, type Status} from '../types';
import type {EffectMeasurement, Notification} from '../types';
import {addSupport, assigneeForCategory, estimateImpact, requestEscalation, recordEffect, confirmResult} from '../lib/innovation';

const STORAGE_KEY = 'dauys-react-ui:v2';
const localId = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
interface Snapshot {version: 2; appeals: Appeal[]; notifications: Notification[]}
const seedAuthor = (index: number) => [3, 7].includes(index) ? 'Алия Касымова' : ['Марат Ахметов', 'Елена Орлова', 'Тимур Нурланов'][index % 3];
const now = Date.now();
const initialAppeals: Appeal[] = seed.map((item, index) => {
  const createdAt = now - (20 - index) * DAY;
  const status = item.status as Status;
  return {
    ...item, status, kind: item.kind as Appeal['kind'], id: `A-${String(index + 1).padStart(3, '0')}`,
    author: seedAuthor(index), assignee: assigneeForCategory(item.category), createdAt,
    updatedAt: createdAt + DAY, dueAt: createdAt + 7 * DAY,
    firstResponseHours: status === 'waiting' ? 6 : null,
    result: status === 'rejected' ? 'Сейчас нет подходящего помещения. Вернёмся к предложению при перепланировке.'
      : status === 'resolved' ? 'Пилотное изменение внедрено. Ожидаем подтверждение автора.'
      : item.kind === 'praise' && status === 'closed' ? 'Благодарность передана организаторам учебных встреч.' : '',
    comments: status === 'waiting' ? [{id: `c-${index}`, author: 'Данияр Садыков', body: 'Уточните, пожалуйста, пример ситуации. Это поможет выбрать решение.', createdAt: createdAt + 6 * 3_600_000}] : [],
    history: [{status: 'new', createdAt}, ...(status !== 'new' ? [{status, createdAt: createdAt + DAY}] : [])],
  };
});

function isAppeal(value: unknown): value is Appeal {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.title === 'string' && typeof item.description === 'string'
    && typeof item.category === 'string' && typeof item.department === 'string' && typeof item.author === 'string'
    && typeof item.assignee === 'string' && typeof item.result === 'string'
    && (item.firstResponseHours === null || typeof item.firstResponseHours === 'number' && Number.isFinite(item.firstResponseHours) && item.firstResponseHours >= 0)
    && typeof item.status === 'string' && Object.hasOwn(statusLabels, item.status)
    && ['problem', 'idea', 'praise'].includes(String(item.kind))
    && ['createdAt', 'updatedAt', 'dueAt'].every(key => typeof item[key] === 'number' && Number.isFinite(item[key]))
    && Array.isArray(item.comments) && item.comments.every(c => c && typeof c.id === 'string' && typeof c.body === 'string' && typeof c.author === 'string' && Number.isFinite(c.createdAt))
    && Array.isArray(item.history) && item.history.every(h => h && Object.hasOwn(statusLabels, h.status) && Number.isFinite(h.createdAt));
}

function cleanOptional(item: Appeal): Appeal {
  const value = {...item};
  // v1 assigned the same placeholder author to every source record.
  if (/^A-0(0[1-9]|1[0-9]|20)$/.test(value.id) && value.author === 'Алия Касымова') value.author = seedAuthor(Number(value.id.slice(2)) - 1);
  if (value.estimate) { try { estimateImpact(value.estimate); } catch { delete value.estimate; } }
  if (value.measurement && (!Number.isFinite(value.measurement.hoursPerMonth) || value.measurement.hoursPerMonth < 0 || value.measurement.hoursPerMonth > 100000 || typeof value.measurement.evidence !== 'string' || !Number.isFinite(value.measurement.recordedAt))) delete value.measurement;
  if (!Array.isArray(value.supporterIds) || !value.supporterIds.every(id => typeof id === 'string')) value.supporterIds = [];
  if (value.escalation && (!Number.isFinite(value.escalation.requestedAt) || value.escalation.processedAt !== undefined && !Number.isFinite(value.escalation.processedAt))) delete value.escalation;
  value.history = value.history.map(entry => ({...entry, label: typeof entry.label === 'string' ? entry.label : undefined}));
  return value;
}
function loadAppeals(): Snapshot {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Partial<Snapshot> | null;
    if (saved?.version === 2 && Array.isArray(saved.appeals) && saved.appeals.every(isAppeal)) return {version: 2, appeals: saved.appeals.map(cleanOptional), notifications: Array.isArray(saved.notifications) ? saved.notifications.filter(n => n && typeof n.id === 'string' && typeof n.body === 'string' && typeof n.appealId === 'string' && typeof n.read === 'boolean' && Number.isFinite(n.createdAt)).slice(0, 100) : []};
    const legacy: unknown = JSON.parse(localStorage.getItem('dauys-react-ui:v1') || 'null');
    if (Array.isArray(legacy) && legacy.every(isAppeal)) return {version: 2, appeals: legacy.map(cleanOptional), notifications: []};
  } catch { /* Storage can be unavailable in private or restricted browsing. */ }
  return {version: 2, appeals: initialAppeals, notifications: []};
}

function notice(state: Snapshot, appealId: string, body: string): Notification[] {
  return [{id: localId(), appealId, body, createdAt: Date.now(), read: false}, ...state.notifications].slice(0, 100);
}

/** Client-only demo repository. Replace this hook with the Go API for integration. */
export function useAppeals() {
  const [state, setState] = useState<Snapshot>(loadAppeals);
  const appeals = state.appeals;
  const [storageAvailable, setStorageAvailable] = useState(true);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); setStorageAvailable(true); }
    catch { setStorageAvailable(false); }
  }, [state]);

  // This outbox is intentionally local. A production consumer must call the Go API.
  useEffect(() => {
    const pending = state.appeals.filter(item => item.escalation && !item.escalation.processedAt);
    if (!pending.length) return;
    const timer = window.setTimeout(() => {
      pending.forEach(item => window.dispatchEvent(new CustomEvent('dauys:escalation', {detail: {appealId: item.id, requestedAt: item.escalation!.requestedAt}})));
      setState(current => {
        const ids = new Set(pending.map(item => item.id));
        const ready = current.appeals.filter(item => ids.has(item.id) && item.escalation && !item.escalation.processedAt);
        if (!ready.length) return current;
        return {...current, appeals: current.appeals.map(item => !ready.includes(item) ? item : {...item, escalation: {...item.escalation!, processedAt: Date.now()}}), notifications: ready.reduce((list, item) => notice({...current, notifications: list}, item.id, `${item.id}: запрос ускорения обработан локальной демо-очередью.`), current.notifications)};
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [state.appeals]);

  const create = useCallback((input: NewAppeal) => {
    const timestamp = Date.now();
    const item: Appeal = {
      ...input, title: input.title.trim(), description: input.description.trim(), id: `A-${localId().slice(-8)}`,
      status: 'new', priority: 'medium', author: 'Алия Касымова', assignee: assigneeForCategory(input.category),
      createdAt: timestamp, updatedAt: timestamp, dueAt: timestamp + 7 * DAY,
      firstResponseHours: null, result: '', comments: [], history: [{status: 'new', createdAt: timestamp}],
    };
    if (input.estimate) estimateImpact(input.estimate);
    setState(current => ({...current, appeals: [item, ...current.appeals], notifications: notice(current, item.id, `Создано обращение «${item.title}». Ответственный: ${item.assignee}.`)}));
    return item.id;
  }, []);

  const comment = useCallback((id: string, body: string) => {
    if (!body.trim()) return;
    setState(current => ({...current, appeals: current.appeals.map(item => item.id !== id ? item : {
      ...item, updatedAt: Date.now(), comments: [...item.comments, {
        id: localId(), author: 'Алия Касымова', body: body.trim().slice(0, 3000), createdAt: Date.now(),
      }],
    })}));
  }, []);

  const confirm = useCallback((id: string) => {
    setState(current => {
      const item = current.appeals.find(value => value.id === id);
      if (!item) return current;
      const updated = confirmResult(item, Date.now());
      return updated === item ? current : {...current, appeals: current.appeals.map(value => value === item ? updated : value), notifications: notice(current, id, `${id}: результат подтверждён автором.`)};
    });
  }, []);
  const support = useCallback((id: string) => setState(current => {
    const item = current.appeals.find(value => value.id === id);
    if (!item) return current;
    const updated = addSupport(item);
    if (updated === item) return current;
    return {...current, appeals: current.appeals.map(value => value === item ? updated : value), notifications: notice(current, id, `${id}: вы присоединились к обращению.`)};
  }), []);
  const escalate = useCallback((id: string) => setState(current => {
    const item = current.appeals.find(value => value.id === id);
    if (!item) return current;
    const updated = requestEscalation(item, Date.now());
    return updated === item ? current : {...current, appeals: current.appeals.map(value => value === item ? updated : value)};
  }), []);
  const measure = useCallback((id: string, input: Omit<EffectMeasurement, 'recordedAt'>) => {
    if (!Number.isFinite(input.hoursPerMonth) || input.hoursPerMonth < 0 || input.hoursPerMonth > 100000 || input.evidence.trim().length < 10 || input.evidence.length > 3000) throw new Error('Укажите часы и основание замера (от 10 символов).');
    setState(current => {
      const item = current.appeals.find(value => value.id === id);
      if (!item) return current;
      const updated = recordEffect(item, input, Date.now());
      return updated === item ? current : {...current, appeals: current.appeals.map(value => value === item ? updated : value), notifications: notice(current, id, `${id}: записан замер эффекта, ожидает подтверждения.`)};
    });
  }, []);
  const readAll = useCallback(() => setState(current => ({...current, notifications: current.notifications.map(item => ({...item, read: true}))})), []);
  return {appeals, notifications: state.notifications, create, comment, confirm, support, escalate, measure, readAll, storageAvailable};
}

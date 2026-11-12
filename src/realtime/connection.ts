import {api, ApiError, SESSION_EXPIRED} from '../api/client';
interface Connection {userId: string; source: EventSource; listeners: Set<() => void>; dispose: ReturnType<typeof setTimeout> | null}
let connection: Connection | null = null;

/** One connection per tab; deferred release also covers StrictMode setup/cleanup/setup. */
export function subscribe(userId: string, listener: () => void) {
  if (connection && connection.userId !== userId) {if (connection.dispose) clearTimeout(connection.dispose); connection.source.close(); connection = null;}
  if (!connection) {
    const current: Connection = {userId, source: new EventSource('/api/events'), listeners: new Set(), dispose: null};
    let revision = '', checkingSession = false;
    current.source.addEventListener('open', () => {revision = '';});
    current.source.addEventListener('update', event => {
      try {
        const payload: unknown = JSON.parse((event as MessageEvent).data);
        if (!payload || typeof payload !== 'object' || !('revision' in payload) || typeof payload.revision !== 'string' || payload.revision === revision) return;
        revision = payload.revision; current.listeners.forEach(notify => notify());
      } catch { /* A malformed event never becomes application data. */ }
    });
    current.source.addEventListener('error', () => {
      if (checkingSession || !current.listeners.size) return;
      checkingSession = true;
      void api.me().catch(error => {if (error instanceof ApiError && error.status === 401) {current.source.close(); window.dispatchEvent(new Event(SESSION_EXPIRED));}}).finally(() => {checkingSession = false;});
    });
    connection = current;
  }
  const current = connection;
  if (current.dispose) {clearTimeout(current.dispose); current.dispose = null;}
  current.listeners.add(listener);
  return () => {
    current.listeners.delete(listener);
    if (!current.listeners.size) current.dispose = setTimeout(() => {if (!current.listeners.size) {current.source.close(); if (connection === current) connection = null;}}, 0);
  };
}

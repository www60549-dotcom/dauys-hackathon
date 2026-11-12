import {useState} from 'react';
import {request} from '../api/client';
import type {Metadata} from '../api/contracts';
export function ServerAdminSettings({meta, onChanged}: {meta?: Metadata; onChanged: () => Promise<unknown>}) {
  const [error, setError] = useState(''), [pending, setPending] = useState(false);
  return <section><div className="workspace-page-heading"><div><h1>Настройки системы</h1><p>Кому поступают новые обращения по категориям.</p></div></div><div className="server-panel">{meta?.categories.map(category => <form className="server-routing-row" key={`${category.name}-${category.assignee_id}`} onSubmit={event => {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget); setPending(true); setError('');
    void request('/admin/categories', {method: 'PATCH', body: {name: category.name, assignee_id: form.get('assignee_id')}}).then(onChanged).catch(failure => setError(failure instanceof Error ? failure.message : 'Не удалось сохранить.')).finally(() => setPending(false));
  }}><label>{category.name}<select name="assignee_id" defaultValue={category.assignee_id} disabled={pending}><option value="">Резерв: администратор</option>{meta.executors.map(executor => <option key={executor.id} value={executor.id}>{executor.name}</option>)}</select></label><button className="button button-blue" type="submit" disabled={pending}>Сохранить</button></form>)}{error && <p className="form-error" role="alert">{error}</p>}</div></section>;
}

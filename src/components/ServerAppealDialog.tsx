import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Check, Download, Paperclip, Send} from 'lucide-react';
import {Dialog} from './Dialog';
import {PrimaryButton} from './PrimaryButton';
import {StatusBadge} from './StatusBadge';
import {api, request} from '../api/client';
import {toAppeal} from '../api/adapters';
import {statusLabels, type Status} from '../types';
import {formatDate} from '../lib/utils';
import type {AppealDetail, ManageAppealInput, Metadata, SessionUser} from '../api/contracts';

export function ServerAppealDialog({id, detail, loading, error, user, meta, onClose, onChanged, onRetry}: {id: string | null; detail?: AppealDetail; loading: boolean; error: Error | null; user: SessionUser; meta?: Metadata; onClose: () => void; onChanged: () => Promise<unknown>; onRetry: () => void}) {
  const [comment, setComment] = useState(''), [failure, setFailure] = useState('');
  const [pending, setPending] = useState(false), [file, setFile] = useState<File | null>(null);
  const lock = useRef(false);
  const [management, setManagement] = useState<ManageAppealInput | null>(null);
  const item = detail?.appeal;
  useEffect(() => {setComment(''); setFailure(''); setFile(null);}, [id]);
  useEffect(() => {
    setManagement(item ? {status: item.status, priority: item.priority, assignee_id: item.assignee_id, parent_id: item.parent_id, result: item.result, actual_effect: item.actual_effect, due_at: item.due_at} : null);
  }, [item?.id, item?.updated_at]);
  const handler = !!item && (user.role === 'admin' || user.role === 'executor' && item.assignee_id === user.id);
  const participant = !!item && (handler || item.author_id === user.id);
  const execute = async (operation: () => Promise<unknown>, after?: () => void) => {
    if (lock.current) return;
    lock.current = true; setPending(true); setFailure('');
    try {await operation(); after?.(); await onChanged();}
    catch (reason) {setFailure(reason instanceof Error ? reason.message : 'Не удалось выполнить действие.');}
    finally {lock.current = false; setPending(false);}
  };
  const postComment = (event: FormEvent) => {event.preventDefault(); if (item && comment.trim()) void execute(() => api.comment(item.id, comment.trim()), () => setComment(''));};
  return <Dialog open={!!id} title={item?.title || 'Обращение'} eyebrow={item ? `${item.id} · ${item.category}` : undefined} onClose={() => {if (!pending) onClose();}}>
    {loading && <p role="status" className="workspace-loading">Загружаем карточку…</p>}
    {error && <p className="form-error" role="alert">{error.message} <button className="text-button" onClick={onRetry}>Повторить</button></p>}
    {item && detail && <div className="detail-body" aria-busy={pending}>
      <StatusBadge appeal={toAppeal(item)} pill/>
      <p className="detail-description">{item.description}</p>
      <div className="detail-people"><span>Автор: {item.author}</span><span>Ответственный: {item.assignee}</span><span>Срок: {formatDate(Date.parse(item.due_at))}</span></div>
      {!handler && item.author_id === user.id && ['new', 'waiting'].includes(item.status) && <AuthorEdit key={`${item.id}-${item.updated_at}`} item={item} pending={pending} onSave={body => {void execute(() => api.edit(item.id, body));}}/>}
      {item.result && <section className={`detail-result ${item.status === 'rejected' ? 'is-rejected' : ''}`}><div><h3>{item.status === 'rejected' ? 'Причина отказа' : item.kind === 'praise' ? 'Ответ на отзыв' : 'Результат'}</h3><p>{item.result}</p>{item.confirmed && <small>Подтверждён автором</small>}</div></section>}
      {item.status === 'resolved' && item.author_id === user.id && <PrimaryButton icon={Check} disabled={pending} onClick={() => {void execute(() => api.confirm(item.id));}}>Подтвердить решение</PrimaryButton>}
      {item.kind === 'idea' && <button className="support-button" disabled={pending} onClick={() => {void execute(() => request(`/appeals/${encodeURIComponent(item.id)}/vote`, {method: 'POST'}));}}>{item.voted ? 'Убрать мой голос' : 'Поддержать идею'} · {item.votes}</button>}
      {handler && management && !['closed', 'rejected'].includes(item.status) && <details className="effect-form"><summary>Работа с обращением</summary><form className="create-form" onSubmit={event => {event.preventDefault(); void execute(() => api.manage(item.id, management));}}>
        <div className="form-grid"><label className="form-field">Статус<select disabled={pending} value={management.status} onChange={event => setManagement({...management, status: event.target.value as Status})}>{(Object.keys(statusLabels) as Status[]).filter(status => status !== 'closed' || item.kind === 'praise').map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
        <label className="form-field">Ответственный<select disabled={pending} value={management.assignee_id} onChange={event => setManagement({...management, assignee_id: event.target.value})}><option value="">Не назначен</option>{meta?.executors.map(executor => <option key={executor.id} value={executor.id}>{executor.name}</option>)}</select></label></div>
        <div className="form-grid"><label className="form-field">Приоритет<select disabled={pending} value={management.priority} onChange={event => setManagement({...management, priority: event.target.value as ManageAppealInput['priority']})}><option value="low">Низкий</option><option value="medium">Обычный</option><option value="high">Высокий</option><option value="critical">Критический</option></select></label>
        <label className="form-field">Срок<input type="date" required disabled={pending} value={management.due_at.slice(0, 10)} onChange={event => setManagement({...management, due_at: `${event.target.value}T18:00:00+05:00`})}/></label></div>
        <label className="form-field">Решение или причина отказа<textarea rows={3} disabled={pending} required={['resolved', 'rejected'].includes(management.status)} minLength={['resolved', 'rejected'].includes(management.status) ? 10 : undefined} maxLength={10000} value={management.result} onChange={event => setManagement({...management, result: event.target.value})}/></label>
        <label className="form-field">Фактический денежный эффект, ₸<input type="number" min={0} max={1000000000} step={1} disabled={pending} value={management.actual_effect} onChange={event => setManagement({...management, actual_effect: Number(event.target.value)})}/></label>
        <PrimaryButton type="submit" disabled={pending}>Сохранить изменения</PrimaryButton>
      </form></details>}
      <section className="detail-history"><h3>История обращения</h3><ol>{detail.history.map(entry => <li key={entry.id}><i className="history-dot"/><span>{formatDate(Date.parse(entry.created_at))}</span><strong>{entry.action}<small className="history-author">{entry.name}</small></strong></li>)}</ol></section>
      <section className="server-files"><h3>Вложения</h3>{detail.files.map(attachment => <a key={attachment.id} href={`/api/files/${encodeURIComponent(attachment.id)}`} className="text-button"><Download size={16}/>{attachment.name} · {Math.ceil(attachment.size / 1024)} КБ</a>)}{!detail.files.length && <p className="muted">Вложений пока нет.</p>}
        {participant && <div className="server-upload"><label className="form-field">Добавить файл до 10 МиБ<input type="file" disabled={pending} accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx" onChange={event => setFile(event.target.files?.[0] ?? null)}/></label><button className="button" disabled={!file || pending} onClick={() => {
          if (!file) return; if (file.size > 10 * 1024 * 1024) {setFailure('Размер файла превышает 10 МиБ.'); return;}
          void execute(() => api.upload(item.id, file), () => setFile(null));
        }}><Paperclip size={16}/>Прикрепить</button></div>}
      </section>
      <section className="detail-discussion"><h3>Обсуждение</h3>{detail.comments.map(entry => <article className="comment" key={entry.id}><div><h4>{entry.name}<small>{formatDate(Date.parse(entry.created_at))}</small></h4><p>{entry.body}</p></div></article>)}{participant ? <form className="comment-form" onSubmit={postComment}><input aria-label="Комментарий" placeholder="Написать комментарий…" maxLength={3000} required disabled={pending} value={comment} onChange={event => setComment(event.target.value)}/><button type="submit" className="button button-blue" aria-label="Отправить комментарий" disabled={pending || !comment.trim()}><Send size={19}/></button></form> : <p className="muted">В обсуждении участвуют автор и ответственный.</p>}</section>
      {failure && <p className="form-error" role="alert">{failure}</p>}
    </div>}
  </Dialog>;
}

function AuthorEdit({item, pending, onSave}: {item: AppealDetail['appeal']; pending: boolean; onSave: (body: {title: string; description: string; solution: string}) => void}) {
  const [title, setTitle] = useState(item.title), [description, setDescription] = useState(item.description);
  return <details className="effect-form"><summary>Уточнить описание</summary><form className="create-form" onSubmit={event => {event.preventDefault(); onSave({title: title.trim(), description: description.trim(), solution: item.solution});}}><label className="form-field">Заголовок<input value={title} required minLength={5} maxLength={180} disabled={pending} onChange={event => setTitle(event.target.value)}/></label><label className="form-field">Описание<textarea value={description} required minLength={10} maxLength={10000} rows={4} disabled={pending} onChange={event => setDescription(event.target.value)}/></label><PrimaryButton type="submit" disabled={pending}>Сохранить описание</PrimaryButton></form></details>;
}

import {useEffect, useMemo, useRef, useState, type FormEvent} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Check, Download, Paperclip, Send} from 'lucide-react';
import {Dialog} from './Dialog';
import {PrimaryButton} from './PrimaryButton';
import {StatusBadge} from './StatusBadge';
import {AppealConflict} from './AppealConflict';
import {BusinessFeaturePanel} from './BusinessFeaturePanel';
import {SimilarAppeals} from './SimilarAppeals';
import {api, ApiError, request} from '../api/client';
import {toAppeal} from '../api/adapters';
import {statusLabels, type Status} from '../types';
import {formatDate} from '../lib/utils';
import {createAppealDraft, reconcileAppealDraft, isStaleDraft, toEditInput, toManageInput, dateForInput, type AppealDraft} from '../lib/appealDraft';
import type {AppealDetail, Metadata, SessionUser} from '../api/contracts';

interface Props {id: string | null; detail?: AppealDetail; loading: boolean; error: Error | null; user: SessionUser; meta?: Metadata; onClose: () => void; onChanged: () => Promise<unknown>; onRetry: () => void}

export function ServerAppealDialog({id, detail, loading, error, user, meta, onClose, onChanged, onRetry}: Props) {
  const client = useQueryClient();
  const [comment, setComment] = useState(''), [failure, setFailure] = useState('');
  const [pending, setPending] = useState(false), [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<AppealDraft | null>(null);
  const [editing, setEditing] = useState<'content' | 'manage' | 'reopen' | null>(null), [conflict, setConflict] = useState(false);
  const [businessBusy,setBusinessBusy]=useState(false),[businessDirty,setBusinessDirty]=useState(false),[activePilotState,setActivePilot]=useState<{id:string|null;active:boolean}>({id:null,active:false}),[showSimilar,setShowSimilar]=useState(false);
  const selection=useRef(id); selection.current=id;
  const businessCallbacks=useMemo(()=>({busy:(value:boolean)=>{if(selection.current===id)setBusinessBusy(value);},dirty:(value:boolean)=>{if(selection.current===id)setBusinessDirty(value);},active:(value:boolean)=>{if(selection.current===id)setActivePilot({id,active:value});}}),[id]);
  const activePilot=activePilotState.id===id && activePilotState.active;
  const lock = useRef(false), item = detail?.appeal;
  useEffect(() => {setComment(''); setFailure(''); setFile(null); setConflict(false); setEditing(null);}, [id]);
  useEffect(()=>{setBusinessBusy(false);setBusinessDirty(false);setShowSimilar(false);},[id]);
  useEffect(() => {setDraft(current => reconcileAppealDraft(current,item));}, [item?.id,item?.version]);
  const participant = detail?.permissions?.can_comment ?? false;
  const versionReady = !!item && Number.isInteger(item.version);
  const stale = isStaleDraft(draft,item) || conflict;
  const busy = pending || businessBusy;
  const blocked = busy || businessDirty || stale || !versionReady;
  const change = (patch: Partial<AppealDraft>, mode: 'content' | 'manage' | 'reopen') => {
    setEditing(mode); setDraft(current => current ? {...current,...patch,dirty:true} : current);
  };
  const markSaved = () => {setDraft(current => current ? {...current,dirty:false} : current); setEditing(null); setConflict(false);};
  const execute = async (operation: () => Promise<unknown>, after?: () => void) => {
    if (lock.current) return;
    lock.current = true; setPending(true); setFailure('');
    try {await operation(); after?.(); await onChanged();}
    catch (reason) {
      setFailure(reason instanceof Error ? reason.message : 'Не удалось выполнить действие.');
      if (reason instanceof ApiError && reason.code === 'version_conflict') {setConflict(true); await onChanged();}
    } finally {lock.current = false; setPending(false);}
  };
  const reloadDraft = async () => {
    if (!id || lock.current) return;
    lock.current = true; setPending(true); setFailure('');
    try {
      const latest = await api.detail(id);
      client.setQueryData(['workspace',user.id,'detail',id],latest);
      setDraft(createAppealDraft(latest.appeal)); setConflict(false); setEditing(null);
    } catch (reason) {setFailure(reason instanceof Error ? reason.message : 'Не удалось обновить карточку.');}
    finally {lock.current = false; setPending(false);}
  };
  const postComment = (event: FormEvent) => {event.preventDefault(); if (item && comment.trim()) void execute(() => api.comment(item.id,comment.trim()),() => setComment(''));};
  const contentBlocked = blocked || !!draft?.dirty && editing !== 'content';
  const manageBlocked = blocked || !!draft?.dirty && editing !== 'manage';
  const reopenBlocked = blocked || !!draft?.dirty && editing !== 'reopen';
  const managementTargets = detail?.allowed_transitions.filter(status => (status !== 'closed' || item?.kind === 'praise') && (!activePilot || !['resolved','rejected','closed'].includes(status))) ?? [];
  return <Dialog open={!!id} title={item?.title || 'Обращение'} eyebrow={item ? `${item.id} · ${item.category}` : undefined} onClose={() => {if (!busy) onClose();}}>
    {loading && <p role="status" className="workspace-loading">Загружаем карточку…</p>}
    {error && <p className="form-error" role="alert">{error.message} <button className="text-button" onClick={onRetry}>Повторить</button></p>}
    {item && detail && <div className="detail-body" aria-busy={busy}>
      <StatusBadge appeal={toAppeal(item)} pill/>
      <p className="detail-description">{item.description}</p>
      <div className="detail-people"><span>Автор: {item.author}</span><span>Ответственный: {item.assignee}</span><span>Срок: {formatDate(Date.parse(item.due_at))}</span></div>
      {versionReady ? <small className="history-author">Версия карточки: {item.version}</small> : <p className="form-error">Сервис обновляется. Обновите карточку перед изменением.</p>}
      {stale && draft && <AppealConflict draft={draft} item={item} meta={meta} pending={pending} onReload={() => {void reloadDraft();}}/>}
      {detail.permissions?.can_edit && draft && <details className="effect-form"><summary>Уточнить описание</summary>
        <form className="create-form" onSubmit={event => {event.preventDefault(); if (!contentBlocked) void execute(() => api.edit(item.id,toEditInput(draft)),markSaved);}}>
          <label className="form-field">Заголовок<input value={draft.title} required minLength={5} maxLength={180} disabled={contentBlocked} onChange={event => change({title:event.target.value},'content')}/></label>
          <label className="form-field">Описание<textarea value={draft.description} required minLength={10} maxLength={10000} rows={4} disabled={contentBlocked} onChange={event => change({description:event.target.value},'content')}/></label>
          <PrimaryButton type="submit" disabled={contentBlocked}>Сохранить описание</PrimaryButton>
        </form>
      </details>}
      {item.result && <section className={`detail-result ${item.status === 'rejected' ? 'is-rejected' : ''}`}><div><h3>{item.status === 'rejected' ? 'Причина отказа' : item.kind === 'praise' ? 'Ответ на отзыв' : 'Результат'}</h3><p>{item.result}</p>{item.confirmed && <small>Подтверждён автором</small>}</div></section>}
      {item.status === 'resolved' && item.kind !== 'praise' && item.author_id === user.id && <PrimaryButton icon={Check} disabled={blocked || !!draft?.dirty} onClick={() => {void execute(() => api.confirm(item.id,item.version),markSaved);}}>Подтвердить решение</PrimaryButton>}
      {['resolved','closed'].includes(item.status) && item.kind !== 'praise' && item.author_id === user.id && draft && <details className="effect-form"><summary>Проблема вернулась или осталась нерешённой</summary>
        <form className="create-form" onSubmit={event => {event.preventDefault(); if (!reopenBlocked) void execute(() => api.reopen(item.id,draft.reopen_reason.trim(),draft.expected_version),markSaved);}}>
          <p className="muted">Опишите, что повторилось. Предыдущее решение сохранится в истории, а обращение вернётся в работу.</p>
          <label className="form-field">Что произошло снова?<textarea required minLength={10} maxLength={3000} rows={3} value={draft.reopen_reason} disabled={reopenBlocked} onChange={event => change({reopen_reason:event.target.value},'reopen')}/></label>
          <PrimaryButton type="submit" disabled={reopenBlocked}>Вернуть в работу</PrimaryButton>
        </form>
      </details>}
      {item.kind === 'idea' && <button className="support-button" disabled={busy} onClick={() => {void execute(() => request(`/appeals/${encodeURIComponent(item.id)}/vote`,{method:'POST'}));}}>{item.voted ? 'Убрать мой голос' : 'Поддержать идею'} · {item.votes}</button>}
      {detail.permissions?.can_manage && draft && <details className="effect-form"><summary>Работа с обращением</summary>
        <form className="create-form" onSubmit={event => {event.preventDefault(); if (!manageBlocked && managementTargets.includes(draft.status)) void execute(() => api.manage(item.id,{...toManageInput(draft),actual_effect:item.kind === 'praise' ? 0 : draft.actual_effect}),markSaved);}}>
          <div className="form-grid"><label className="form-field">Статус<select disabled={manageBlocked} value={draft.status} onChange={event => change({status:event.target.value as Status},'manage')}>{!managementTargets.includes(draft.status) && <option value={draft.status} disabled>{statusLabels[draft.status]} · выберите следующий статус</option>}{managementTargets.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
          <label className="form-field">Ответственный<select disabled={manageBlocked} value={draft.assignee_id} onChange={event => change({assignee_id:event.target.value},'manage')}><option value="">Не назначен</option>{meta?.executors.map(executor => <option key={executor.id} value={executor.id}>{executor.name}</option>)}</select></label></div>
          <div className="form-grid"><label className="form-field">Приоритет<select disabled={manageBlocked} value={draft.priority} onChange={event => change({priority:event.target.value as AppealDraft['priority']},'manage')}><option value="low">Низкий</option><option value="medium">Обычный</option><option value="high">Высокий</option><option value="critical">Критический</option></select></label>
          <label className="form-field">Срок<input type="date" required disabled={manageBlocked} value={dateForInput(draft.due_at)} onChange={event => change({due_at:`${event.target.value}T18:00:00+05:00`},'manage')}/></label></div>
          <label className="form-field">Решение или причина ответа<textarea rows={3} disabled={manageBlocked} required={['resolved','rejected','closed'].includes(draft.status)} minLength={['resolved','rejected','closed'].includes(draft.status) ? 10 : undefined} maxLength={10000} value={draft.result} onChange={event => change({result:event.target.value},'manage')}/></label>
          {item.kind !== 'praise' && <label className="form-field">Фактический денежный эффект, ₸<input type="number" min={0} max={1000000000} step={1} disabled={manageBlocked} value={draft.actual_effect} onChange={event => change({actual_effect:Number(event.target.value)},'manage')}/></label>}
          <PrimaryButton type="submit" disabled={manageBlocked || !managementTargets.includes(draft.status)}>Сохранить изменения</PrimaryButton>
        </form>
      </details>}
      {item.kind!=='praise' && <BusinessFeaturePanel key={item.id} item={item} user={user} meta={meta} externalBlocked={pending || !!draft?.dirty || conflict} onChanged={onChanged} onBusyChange={businessCallbacks.busy} onDirtyChange={businessCallbacks.dirty} onActiveChange={businessCallbacks.active}/>}
      <details className="business-section" onToggle={event=>setShowSimilar(event.currentTarget.open)}><summary>Похожие обращения</summary><SimilarAppeals title={item.title} description={item.description} userId={user.id} active={showSimilar} exclude={item.id}/></details>
      <section className="detail-history"><h3>История обращения</h3><ol>{detail.history.map(entry => <li key={entry.id}>
        <i className={`history-dot ${entry.to_status ? `status-${entry.to_status}` : ''}`}/><span>{formatDate(Date.parse(entry.created_at))}</span>
        <strong>{entry.action}{entry.to_status && <span className="history-transition">{entry.from_status ? `${statusLabels[entry.from_status]} → ` : ''}{statusLabels[entry.to_status]}</span>}
          <small className="history-author">{entry.name}{entry.appeal_version ? ` · версия ${entry.appeal_version}` : ''}{!entry.event_type || entry.event_type === 'legacy' ? ' · историческая запись' : ''}</small>
        </strong>
      </li>)}</ol></section>
      <section className="server-files"><h3>Вложения</h3>{detail.files.map(attachment => <a key={attachment.id} href={`/api/files/${encodeURIComponent(attachment.id)}`} className="text-button"><Download size={16}/>{attachment.name} · {Math.ceil(attachment.size/1024)} КБ</a>)}{!detail.files.length && <p className="muted">Вложений пока нет.</p>}
        {participant && <div className="server-upload"><label className="form-field">Добавить файл до 10 МиБ<input type="file" disabled={busy} accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx" onChange={event => setFile(event.target.files?.[0] ?? null)}/></label><button className="button" disabled={!file || busy} onClick={() => {
          if (!file) return; if (file.size > 10*1024*1024) {setFailure('Размер файла превышает 10 МиБ.'); return;}
          void execute(() => api.upload(item.id,file),() => setFile(null));
        }}><Paperclip size={16}/>Прикрепить</button></div>}
      </section>
      <section className="detail-discussion"><h3>Обсуждение</h3>{detail.comments.map(entry => <article className="comment" key={entry.id}><div><h4>{entry.name}<small>{formatDate(Date.parse(entry.created_at))}</small></h4><p>{entry.body}</p></div></article>)}{participant ? <form className="comment-form" onSubmit={postComment}><input aria-label="Комментарий" placeholder="Написать комментарий…" maxLength={3000} required disabled={busy} value={comment} onChange={event => setComment(event.target.value)}/><button type="submit" className="button button-blue" aria-label="Отправить комментарий" disabled={busy || !comment.trim()}><Send size={19}/></button></form> : <p className="muted">В обсуждении участвуют автор и ответственный.</p>}</section>
      {failure && <p className="form-error" role="alert">{failure}</p>}
    </div>}
  </Dialog>;
}

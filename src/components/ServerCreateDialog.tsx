import {useEffect, useRef, useState} from 'react';
import {Mic, ArrowUpRight} from 'lucide-react';
import {Dialog} from './Dialog';
import {PrimaryButton} from './PrimaryButton';
import {api} from '../api/client';
import {useSpeechInput} from '../hooks/useSpeechInput';
import {SimilarAppeals} from './SimilarAppeals';
import {kindLabels, type ComposeContext, type Kind} from '../types';
import type {CreateAppealInput, Metadata, SessionUser} from '../api/contracts';

export function ServerCreateDialog({open, kind, context, meta, user, onClose, onCreated}: {open: boolean; kind: Kind; context?: ComposeContext; meta?: Metadata; user: SessionUser; onClose: () => void; onCreated: (id: string) => void}) {
  const [form, setForm] = useState<CreateAppealInput>({title: '', description: '', category: '', department: user.department, kind, priority: 'medium', affected: 1, expected_effect: 0});
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const speech = useSpeechInput(form.description, description => setForm(current => ({...current, description})), open && !pending);
  useEffect(() => {if (open) {setForm({title: '', description: '', category: context?.category || '', department: context?.department || user.department, kind, priority: 'medium', affected: 1, expected_effect: 0}); setError('');}}, [open, kind, context, user.department]);
  const assignment = meta?.categories.find(category => category.name === form.category)?.assignee_id;
  const officer = meta?.executors.find(executor => executor.id === assignment);
  return <Dialog open={open} title="Новое обращение" onClose={() => {if (!pending) onClose();}}>
    <form className="create-form" aria-busy={pending} onSubmit={event => {
      event.preventDefault(); if (lock.current) return;
      lock.current = true; setPending(true); setError('');
      void api.create({...form, title: form.title.trim(), description: form.description.trim()})
        .then(({id}) => onCreated(id)).catch(failure => setError(failure instanceof Error ? failure.message : 'Не удалось отправить обращение.'))
        .finally(() => {lock.current = false; setPending(false);});
    }}>
      <fieldset disabled={pending}><legend>Тип обращения</legend><div className="kind-selector">{(Object.keys(kindLabels) as Kind[]).map(value => <button type="button" key={value} className={`button ${form.kind === value ? 'button-blue' : ''}`} aria-pressed={form.kind === value} onClick={() => setForm({...form, kind: value})}>{kindLabels[value]}</button>)}</div></fieldset>
      <label className="form-field">Коротко о главном<input required minLength={5} maxLength={180} autoFocus value={form.title} disabled={pending} onChange={event => setForm({...form, title: event.target.value})}/></label>
      <div className="form-grid"><label className="form-field">Категория<select required value={form.category} disabled={pending || !meta} onChange={event => setForm({...form, category: event.target.value})}><option value="">Выберите категорию</option>{meta?.categories.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
      <label className="form-field">Подразделение<select required value={form.department} disabled={pending || !meta} onChange={event => setForm({...form, department: event.target.value})}>{(meta?.departments ?? [user.department]).map(item => <option key={item}>{item}</option>)}</select></label></div>
      <label className="form-field">Что произошло или что предлагаете?<textarea required minLength={10} maxLength={10000} rows={5} value={form.description} disabled={pending} onChange={event => setForm({...form, description: event.target.value})}/></label>
      {speech.supported && <button type="button" className="text-button" disabled={pending} onClick={speech.toggle}><Mic size={17}/>{speech.listening ? 'Остановить запись' : 'Надиктовать описание'}</button>}
      {speech.error && <p className="form-error" role="status">{speech.error}</p>}
      <SimilarAppeals title={form.title} description={form.description} userId={user.id} active={open && !pending}/>
      <div className="form-grid"><label className="form-field">Приоритет<select value={form.priority} disabled={pending} onChange={event => setForm({...form, priority: event.target.value as CreateAppealInput['priority']})}><option value="low">Низкий</option><option value="medium">Обычный</option><option value="high">Высокий</option><option value="critical">Критический</option></select></label><label className="form-field">Кого затрагивает, человек<input type="number" min={1} max={100000} step={1} required value={form.affected} disabled={pending} onChange={event => setForm({...form, affected: Number(event.target.value)})}/></label></div>
      <p className="muted">{officer ? `Ответственный по категории: ${officer.name}.` : 'Если по категории нет ответственного, обращение поступит администратору.'} Вложения можно добавить в карточке после отправки.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-submit"><PrimaryButton type="submit" icon={ArrowUpRight} disabled={pending || !meta}>{pending ? 'Отправляем…' : 'Отправить обращение'}</PrimaryButton></div>
    </form>
  </Dialog>;
}

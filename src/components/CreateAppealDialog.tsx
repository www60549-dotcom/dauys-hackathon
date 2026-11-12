import {useCallback, useEffect, useState} from 'react';
import {ArrowUpRight, Heart, Lightbulb, MessageSquareWarning} from 'lucide-react';
import {Dialog} from './Dialog';
import {PrimaryButton} from './PrimaryButton';
import {categories} from './CategoryCard';
import {cn} from '../lib/utils';
import {departments, kindLabels, type CategoryId, type Kind, type NewAppeal} from '../types';
import seed from '../data/seed.json';
import type {Appeal, ComposeContext} from '../types';
import {InnovationSuite} from './InnovationSuite';

const categoryNames = [...new Set(seed.map(item => item.category))].sort((a, b) => a.localeCompare(b, 'ru'));
const emptyForm: NewAppeal = {title: '', description: '', category: '', department: 'Закупки', kind: 'problem'};

export function CreateAppealDialog({open, category, initialKind = 'problem', context, covered, appeals, onSupport, onOpen, onClose, onSubmit}: {open: boolean; category: CategoryId | null; initialKind?: Kind; context?: ComposeContext; covered: boolean; appeals: Appeal[]; onSupport: (id: string) => void; onOpen: (id: string) => void; onClose: () => void; onSubmit: (input: NewAppeal) => void}) {
  const [form, setForm] = useState<NewAppeal>(emptyForm);
  const [error, setError] = useState('');
  const [automatic, setAutomatic] = useState(true);
  const route = useCallback((category: string, department: string) => setForm(current => current.category === category && current.department === department ? current : {...current, category, department}), []);
  useEffect(() => {
    if (!open) return;
    const selected = categories.find(item => item.id === category);
    setForm({...emptyForm, kind: initialKind, category: context?.category || selected?.category || '', department: context?.department || selected?.department || 'Закупки'});
    setAutomatic(true);
    setError('');
  }, [open, category, context, initialKind]);
  const set = <K extends keyof NewAppeal>(key: K, value: NewAppeal[K]) => setForm(current => ({...current, [key]: value}));
  return <Dialog open={open} onClose={onClose} eyebrow="МАЛЕНЬКОЕ ПРЕДЛОЖЕНИЕ. БОЛЬШОЕ НАЧАЛО." title="Дайте идее голос.">
    <form className="create-form" onSubmit={event => {
      event.preventDefault();
      if (form.title.trim().length < 5 || form.description.trim().length < 10 || !form.category) { setError('Добавьте заголовок, описание и категорию.'); return; }
      try { onSubmit({...form, title: form.title.trim(), description: form.description.trim()}); }
      catch { setError('Не удалось сохранить обращение. Проверьте поля и повторите попытку.'); }
    }}>
      <fieldset className="kind-selector"><legend>Что вы хотите изменить?</legend><div>{([{kind: 'problem', icon: MessageSquareWarning}, {kind: 'idea', icon: Lightbulb}, {kind: 'praise', icon: Heart}] as const).map(({kind, icon: Icon}) => <button type="button" key={kind} aria-pressed={form.kind === kind} className={cn(form.kind === kind && 'is-active')} onClick={() => set('kind', kind as Kind)}><Icon size={17} strokeWidth={1.6}/>{kindLabels[kind]}</button>)}</div></fieldset>
      <label className="form-field">Коротко о главном<input autoFocus name="title" required minLength={5} maxLength={180} placeholder="Например, инструкции, которые легко найти" value={form.title} onChange={event => set('title', event.target.value)}/></label>
      <div className="form-grid"><label className="form-field">Категория<select required name="category" value={form.category} onChange={event => { setAutomatic(false); set('category', event.target.value); }}><option value="" disabled>Выберите категорию</option>{categoryNames.map(value => <option key={value}>{value}</option>)}</select></label><label className="form-field">Подразделение<select name="department" value={form.department} onChange={event => { setAutomatic(false); set('department', event.target.value); }}>{departments.map(value => <option key={value}>{value}</option>)}</select></label></div>
      <label className="form-field">{form.kind === 'praise' ? 'За что вы хотите поблагодарить?' : 'Что происходит сейчас?'}<textarea name="description" required minLength={10} maxLength={10_000} rows={4} placeholder="Расскажите о ситуации и о том, как она влияет на работу." value={form.description} onChange={event => set('description', event.target.value)}/></label>
      {open && <InnovationSuite active={open && !covered} description={form.description} title={form.title} appeals={appeals} onDescription={value => set('description', value)} automatic={automatic} onAutomatic={setAutomatic} onRoute={route} estimate={form.estimate} onEstimate={value => set('estimate', value)} onOpen={onOpen} onSupport={onSupport}/>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-submit"><p>Вы увидите обсуждение,<br/>статус и результат в одной карточке.</p><PrimaryButton type="submit" icon={ArrowUpRight}>Отправить обращение</PrimaryButton></div>
    </form>
  </Dialog>;
}

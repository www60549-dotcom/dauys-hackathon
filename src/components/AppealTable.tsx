import {useMemo, useState} from 'react';
import {motion, useReducedMotion, type Variants} from 'framer-motion';
import {ArrowRight, ArrowUpRight, Plus, Search, SearchX} from 'lucide-react';
import {cn, formatDate} from '../lib/utils';
import {StatusBadge} from './StatusBadge';
import {PrimaryButton} from './PrimaryButton';
import {departments, kindLabels, type Kind, type Appeal, type Status} from '../types';

const filters: {value: string; label: string; statuses?: Status[]}[] = [
  {value: 'all', label: 'Все'}, {value: 'new', label: 'Новое', statuses: ['new']}, {value: 'progress', label: 'В работе', statuses: ['progress']},
  {value: 'waiting', label: 'Ожидает уточнения', statuses: ['waiting']}, {value: 'resolved', label: 'Решено', statuses: ['resolved', 'closed']},
];

export function AppealTable({items, compact = false, onOpen, onCreate, onShowAll}: {items: Appeal[]; compact?: boolean; onOpen: (id: string) => void; onCreate: () => void; onShowAll?: () => void}) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [kind, setKind] = useState('');
  const reduced = !!useReducedMotion();
  const filtered = useMemo(() => {
    const selected = filters.find(item => item.value === filter);
    const search = query.trim().toLocaleLowerCase('ru-RU');
    return items.filter(item => (!selected?.statuses || selected.statuses.includes(item.status)) && (filter !== 'resolved' || item.kind !== 'praise') && (!kind || item.kind === kind) && (!department || item.department === department) && (!search || `${item.id} ${item.title} ${item.description}`.toLocaleLowerCase('ru-RU').includes(search)));
  }, [items, filter, query, department, kind]);
  const displayed = compact ? filtered.slice(0, 3) : filtered;
  const stagger: Variants = {hidden: {opacity: 1}, show: {opacity: 1, transition: {staggerChildren: reduced ? 0 : 0.065}}};
  const row: Variants = {hidden: {opacity: 0, y: reduced ? 0 : 10}, show: {opacity: 1, y: 0, transition: {duration: reduced ? 0 : 0.35, ease: [0.22, 1, 0.36, 1]}}};

  return <section className={cn('appeals-section', !compact && 'full-list')} aria-labelledby="appeals-title">
    <div className="section-heading table-heading"><div><span className="eyebrow small">{compact ? 'ВАШ ГОЛОС УЖЕ МЕНЯЕТ РАБОТУ' : 'ВСЕ ИДЕИ. ОДНО ПРОСТРАНСТВО.'}</span><h2 id="appeals-title">{compact ? 'Ваши обращения' : 'Мои обращения'} <span className="heading-count">{items.length}</span></h2></div>{!compact && <PrimaryButton onClick={onCreate} icon={Plus}>Создать обращение</PrimaryButton>}</div>
    <div className="table-toolbar"><div className="filter-tabs" aria-label="Фильтр статуса">{filters.map(item => <button key={item.value} className={cn(filter === item.value && 'is-active')} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div><div className="list-search-tools">{!compact && <label className="select-field"><span className="sr-only">Подразделение</span><select value={department} onChange={event => setDepartment(event.target.value)}><option value="">Все подразделения</option>{departments.map(value => <option key={value}>{value}</option>)}</select></label>}<label className="search-field"><Search size={18} strokeWidth={1.6}/><span className="sr-only">Найти обращение</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти обращение"/></label></div></div>
    {!compact && <div className="kind-filter"><label className="select-field"><span>Тип обращения</span><select value={kind} onChange={event => setKind(event.target.value)}><option value="">Все типы</option>{(Object.keys(kindLabels) as Kind[]).map(value => <option key={value} value={value}>{kindLabels[value]}</option>)}</select></label><p className="list-count" role="status">Найдено: {filtered.length} из {items.length}</p>{kind && <button className="text-button" onClick={() => setKind('')}>Сбросить тип</button>}</div>}
    <div className="table-scroll"><table className="appeal-table"><caption className="sr-only">Обращения сотрудников, их статусы и ответственные</caption><thead><tr><th scope="col">Обращение</th><th scope="col">Статус</th><th scope="col" className="assignee-column">Ответственный</th><th scope="col" className="date-column">Обновлено</th><th scope="col"><span className="sr-only">Открыть</span></th></tr></thead><motion.tbody key={`${filter}-${query}-${department}-${kind}`} variants={stagger} initial="hidden" animate="show">{displayed.map(item => <motion.tr key={item.id} variants={row} whileHover={reduced ? undefined : {x: 6}} transition={{type: 'spring', stiffness: 320, damping: 26}} className="appeal-table-row"><td><button className="row-link" aria-label={`Открыть обращение: ${item.title}`} onClick={() => onOpen(item.id)}><span className="row-id">{item.id.replace('A-', '#')}</span><strong>{item.title}</strong><small>{item.category}</small></button></td><td><StatusBadge appeal={item}/></td><td className="assignee-column"><span className="assignee-name">{item.assignee}</span></td><td className="date-column"><time dateTime={new Date(item.updatedAt).toISOString()}>{formatDate(item.updatedAt)}</time></td><td className="arrow-cell"><ArrowUpRight size={22} strokeWidth={1.55}/></td></motion.tr>)}</motion.tbody></table></div>
    {!displayed.length && <div className="empty-state"><SearchX size={30} strokeWidth={1.2}/><h3>Пока ничего не нашлось</h3><p>Попробуйте другую формулировку или сбросьте фильтры.</p><button className="text-button" onClick={() => { setQuery(''); setFilter('all'); setDepartment(''); setKind(''); }}>Сбросить фильтры <ArrowRight size={16}/></button></div>}
    {compact && <div className="table-footer"><span>{filtered.length > displayed.length ? `Ещё ${filtered.length - displayed.length} обращений в вашем пространстве` : 'Каждое обращение остаётся в общей истории'}</span><button className="text-button" onClick={onShowAll}>Все обращения <ArrowRight size={17}/></button></div>}
  </section>;
}

import {motion, useReducedMotion} from 'framer-motion';
import {ArrowUpRight, ChevronLeft, ChevronRight, Search} from 'lucide-react';
import {toAppeal} from '../api/adapters';
import {statusLabels, kindLabels, type Kind, type Status} from '../types';
import {StatusBadge} from './StatusBadge';
import {formatDate} from '../lib/utils';
import type {AppealPage} from '../api/contracts';

export function ServerAppealList({data, loading, error, title, query, status, kind, onFilter, onOpen, onPage, onRetry}: {
  data?: AppealPage; loading: boolean; error: Error | null; title: string; query: string; status: string; kind: string;
  onFilter: (key: string, value: string) => void; onOpen: (id: string) => void; onPage: (page: number) => void; onRetry: () => void;
}) {
  const reduced = !!useReducedMotion();
  return <section className="appeals-page" aria-busy={loading}>
    <div className="workspace-page-heading"><div><h1>{title}</h1><p>{data ? `${data.total} обращений` : 'Обращения сотрудников'}</p></div></div>
    <div className="server-filters"><label className="search-field"><Search size={19}/><input aria-label="Поиск обращений" placeholder="Найти обращение" value={query} onChange={event => onFilter('q', event.target.value)}/></label>
      <select aria-label="Статус" value={status} onChange={event => onFilter('status', event.target.value)}><option value="">Все статусы</option>{(Object.keys(statusLabels) as Status[]).map(value => <option value={value} key={value}>{statusLabels[value]}</option>)}</select>
      <select aria-label="Тип" value={kind} onChange={event => onFilter('kind', event.target.value)}><option value="">Все типы</option>{(Object.keys(kindLabels) as Kind[]).map(value => <option value={value} key={value}>{kindLabels[value]}</option>)}</select>
    </div>
    {error && <div className="server-message" role="alert"><p>{error.message}</p><button className="text-button" onClick={onRetry}>Повторить</button></div>}
    {loading && <p className="workspace-loading" role="status">Загружаем обращения…</p>}
    {data && <><div className="table-scroll"><table className="appeal-table"><caption className="sr-only">{title}</caption><thead><tr><th>Обращение</th><th>Статус</th><th>Ответственный</th><th>Обновлено</th><th><span className="sr-only">Открыть</span></th></tr></thead><tbody>{data.items.map((item, index) => <motion.tr key={item.id} className="appeal-table-row" initial={{opacity: 0, y: reduced ? 0 : 6}} animate={{opacity: 1, y: 0}} transition={{delay: reduced ? 0 : Math.min(index * 0.025, 0.25)}}><td><button className="row-link" onClick={() => onOpen(item.id)}><span className="row-id">{item.id}</span><strong>{item.title}</strong><small>{item.category}</small></button></td><td><StatusBadge appeal={toAppeal(item)}/></td><td>{item.assignee}</td><td><time dateTime={item.updated_at}>{formatDate(Date.parse(item.updated_at))}</time></td><td><ArrowUpRight size={20}/></td></motion.tr>)}</tbody></table></div>
    {!data.items.length && <p className="empty-state">Обращений по выбранным условиям пока нет.</p>}
    <nav className="server-pagination" aria-label="Страницы обращений"><button className="button" disabled={loading || data.page <= 1} onClick={() => onPage(data.page - 1)}><ChevronLeft size={17}/>Назад</button><span>Страница {data.page} из {Math.max(1, Math.ceil(data.total / 30))}</span><button className="button" disabled={loading || data.page * 30 >= data.total} onClick={() => onPage(data.page + 1)}>Далее<ChevronRight size={17}/></button></nav></>}
  </section>;
}

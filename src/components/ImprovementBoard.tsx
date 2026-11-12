import {ArrowUpRight, CheckCircle2, Clock3, Lightbulb} from 'lucide-react';
import {formatDate, formatNumber} from '../lib/utils';
import type {Appeal} from '../types';

export function ImprovementBoard({appeals, onOpen}: {appeals: readonly Appeal[]; onOpen: (id: string) => void}) {
  const items = appeals.filter(item => item.kind !== 'praise' && ['resolved', 'closed'].includes(item.status))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  return <section className="improvement-board results-board" aria-labelledby="results-board-title"><div className="section-heading"><div><h2 id="results-board-title">Результаты улучшений</h2><p>Решения команды и подтверждение сотрудников.</p></div></div>
    <div className="improvement-grid">{items.map(item => <button key={item.id} className="improvement-card" onClick={() => onOpen(item.id)}>
      <span className={`result-state ${item.status === 'closed' ? 'is-confirmed' : ''}`}>{item.status === 'closed' ? <CheckCircle2 size={16}/> : <Clock3 size={16}/>} {item.status === 'closed' ? 'Подтверждено автором' : 'Ожидает подтверждения'}</span>
      <h3>{item.title}</h3><p>{item.result || 'Решение подготовлено командой.'}</p>
      {item.measurement && <strong className="board-effect">{formatNumber(item.measurement.hoursPerMonth, 1)} ч/мес. · {item.status === 'closed' ? 'подтверждено' : 'по замеру'}</strong>}
      <span className="board-cta">{formatDate(item.updatedAt)} <ArrowUpRight size={17}/></span>
    </button>)}</div>
    {!items.length && <div className="section-empty"><Lightbulb size={26}/><h3>Первые результаты ещё впереди</h3><p>Здесь появятся решения по обращениям и подтверждения авторов.</p></div>}
  </section>;
}

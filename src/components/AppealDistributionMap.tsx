import {useMemo, useState} from 'react';
import {ArrowUpRight, Clock3, Layers3} from 'lucide-react';
import {Dialog} from './Dialog';
import {HeatmapCell} from './HeatmapCell';
import {cn, formatDate} from '../lib/utils';
import {filterMapAppeals, isAppealOverdue, sortMapAppeals, type MapMode} from '../lib/appealDynamics';
import {departments, displayStatus, kindLabels, type Appeal, type Kind} from '../types';

type Selection = {department: string; kind?: Kind};

export function AppealDistributionMap({items, now, department, onOpen}: {items: Appeal[]; now: number; department?: string; onOpen: (id: string) => void}) {
  const [mode, setMode] = useState<MapMode>('all');
  const [selection, setSelection] = useState<Selection | null>(null);
  const visible = useMemo(() => filterMapAppeals(items, mode, now), [items, mode, now]);
  const rows = department ? [department] : [...new Set([...departments, ...items.map(item => item.department)])];
  const open = filterMapAppeals(items, 'open', now);
  const overdue = filterMapAppeals(items, 'overdue', now);
  const topDepartment = [...rows].sort((a, b) => open.filter(item => item.department === b).length - open.filter(item => item.department === a).length)[0];
  const topCount = open.filter(item => item.department === topDepartment).length;
  const selected = selection ? sortMapAppeals(visible.filter(item => item.department === selection.department && (!selection.kind || item.kind === selection.kind)), now) : [];
  const modes = [{id: 'all', label: 'Все', count: items.length}, {id: 'open', label: 'Открытые', count: open.length}, {id: 'overdue', label: 'Просрочены', count: overdue.length}] as const;

  return <article className="dashboard-card distribution-card actionable-map">
    <div className="dashboard-heading"><div><span className="eyebrow small">ГДЕ НУЖНО ВНИМАНИЕ</span><h2>Карта обращений</h2></div><Layers3 size={22} strokeWidth={1.5}/></div>
    <div className="map-mode-switch" role="group" aria-label="Какие обращения показать на карте">
      {modes.map(item => <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => {setMode(item.id); setSelection(null);}}>{item.label}<span>{item.count}</span></button>)}
    </div>
    {overdue.length > 0 && <button className="map-attention" onClick={() => {setMode('overdue'); setSelection(null);}}><Clock3 size={17}/><span><strong>{overdue.length} без решения в срок</strong>Показать просроченные обращения</span><ArrowUpRight size={17}/></button>}
    <div className="heatmap-scroll" role="region" aria-label="Карта обращений по подразделениям и типам" tabIndex={0}>
      <table className="appeal-map-table"><caption className="sr-only">Количество обращений и максимальный приоритет. Выберите ячейку для списка обращений.</caption>
        <thead><tr><th scope="col">Подразделение</th>{['Проблемы', 'Идеи', 'Отзывы'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(name => {
          const row = visible.filter(item => item.department === name);
          return <tr key={name}><th scope="row"><button className="map-row-button" disabled={!row.length} onClick={() => setSelection({department: name})}>{name}<small>{row.length} в этом срезе</small></button></th>
            {(['problem', 'idea', 'praise'] as const).map(kind => {
              const matches = row.filter(item => item.kind === kind);
              return <td key={kind}><HeatmapCell department={name} kind={kind} items={matches} onOpen={onOpen}
                overdueCount={matches.filter(item => isAppealOverdue(item, now)).length}
                onSelect={() => setSelection({department: name, kind})}/></td>;
            })}</tr>;
        })}</tbody>
      </table>
    </div>
    {!visible.length && <p className="map-empty">{items.length ? 'В этом срезе обращений нет. Выберите другой фильтр карты.' : 'За выбранный период обращений нет.'}</p>}
    <div className="heatmap-priority-legend"><span>Цвет — максимальный приоритет:</span><span><i className="priority-low"/>Низкий</span><span><i className="priority-medium"/>Средний</span><span><i className="priority-high"/>Высокий</span></div>
    {topCount > 0 && <button className="map-insight" onClick={() => {setMode('open'); setSelection({department: topDepartment});}}><span>Больше всего открытых<strong>{topDepartment} · {topCount}</strong></span><ArrowUpRight size={18}/></button>}
    <p className="heatmap-help">Число — обращения, «!» — просрочки. Выберите ячейку или подразделение, чтобы разобрать все записи.</p>
    <Dialog open={selection !== null} onClose={() => setSelection(null)} title={selection ? `${selection.department}${selection.kind ? ` · ${kindLabels[selection.kind]}` : ''}` : 'Обращения'} eyebrow="ИЗ КАРТЫ ОБРАЩЕНИЙ" className="map-details-dialog">
      <p className="map-details-intro">Найдено: {selected.length}. Сначала показаны просроченные, затем открытые обращения.</p>
      <div className="map-appeal-list">{selected.map(item => <button key={item.id} className="map-appeal-item" onClick={() => {setSelection(null); onOpen(item.id);}}>
        <span><small>{item.id} · {item.category}</small><strong>{item.title}</strong><span className="map-item-meta">{item.assignee || 'Ответственный не назначен'} · {formatDate(item.createdAt)}</span></span>
        <span className="map-item-trailing"><span className={cn('map-status', isAppealOverdue(item, now) && 'is-overdue')}>{isAppealOverdue(item, now) ? 'Просрочено' : displayStatus(item)}</span><ArrowUpRight size={18}/></span>
      </button>)}{!selected.length && <p className="map-empty">В выбранной ячейке обращений нет.</p>}</div>
      <p className="heatmap-help">Откройте обращение, чтобы ответить автору, назначить ответственного или обновить статус.</p>
    </Dialog>
  </article>;
}

import {lazy, Suspense, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from '../api/client';
import {CountUp} from './CountUp';
import {ROICalculator} from './ROICalculator';
import {formatNumber} from '../lib/utils';
import {NavigationTabs} from './NavigationTabs';
const BarChart = lazy(() => import('./BklitAppealBarChart'));

export function ServerAnalytics({userId, departments, onOpen}: {userId: string; departments: string[]; onOpen: (id: string) => void}) {
  const [month, setMonth] = useState(''), [department, setDepartment] = useState('');
  const [section, setSection] = useState<'summary' | 'problems' | 'effect'>('summary');
  const {data, error, isPending, refetch} = useQuery({queryKey: ['workspace', userId, 'analytics', month, department], queryFn: ({signal}) => api.dashboard({month, department}, signal)});
  const points = data?.trend.map(week => ({month: `Неделя ${week.week}`, received: week.total, withSolution: week.resolved})) ?? [];
  const average = points.reduce((sum, point) => sum + point.received, 0) / Math.max(1, points.length);
  return <section className="analytics-page">
    <div className="workspace-page-heading"><div><h1>Аналитика и итоги</h1><p>Данные всех доступных обращений из общей базы.</p></div><div className="server-filters"><label className="form-field">Месяц<input type="month" value={month} onChange={event => setMonth(event.target.value)}/></label><select aria-label="Подразделение" value={department} onChange={event => setDepartment(event.target.value)}><option value="">Все подразделения</option>{departments.map(value => <option key={value}>{value}</option>)}</select></div></div>
    <NavigationTabs id="server-analytics" label="Разделы аналитики" value={section} onChange={setSection} tabs={[{id: 'summary', label: 'Общая сводка'}, {id: 'problems', label: 'Проблемные зоны'}, {id: 'effect', label: 'Эффект и экономия'}]}/>
    {isPending && <p role="status" className="workspace-loading">Загружаем аналитику…</p>}{error && <p role="alert" className="form-error">{error.message} <button onClick={() => {void refetch();}}>Повторить</button></p>}
    {data && section === 'summary' && <><div className="server-metrics">{[
      {label: 'Поступило', value: data.summary.total}, {label: 'С решением', value: data.summary.resolved},
      {label: 'Первый ответ, ч', value: data.summary.first_response_hours}, {label: 'Просрочено', value: data.summary.overdue},
    ].map(metric => <article className="server-metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value === null ? '—' : <CountUp value={metric.value}/>}</strong></article>)}</div><section className="server-panel"><h2>Динамика обращений</h2><p className="muted">Пять недель. «Из них с решением» — текущий итог обращений, созданных в соответствующую неделю.</p><Suspense fallback={<p role="status">Загружаем график…</p>}><BarChart points={points} average={average} peak={Math.max(1, ...points.map(point => point.received))}/></Suspense></section></>}
    {data && section === 'problems' && <div className="server-panels"><section className="server-panel"><h2>Карта проблем</h2><div className="table-scroll"><table className="server-heatmap"><thead><tr><th>Подразделение</th>{['Сроки', 'Доступ', 'Инструкции'].map(topic => <th key={topic}>{topic}</th>)}</tr></thead><tbody>{departments.map(dept => <tr key={dept}><th>{dept}</th>{['Сроки', 'Доступ', 'Инструкции'].map(topic => {
      const cell = data.heatmap.find(value => value.department === dept && value.topic === topic);
      return <td key={topic}><span tabIndex={0} className={cell && cell.score >= 50 ? 'heat-high' : cell?.total ? 'heat-medium' : 'heat-empty'} title={`${dept} · ${topic}: ${cell?.total ?? 0} обращений. Индекс внимания: ${cell?.score ?? 0}.`}>{cell?.total ?? 0}</span></td>;
    })}</tr>)}</tbody></table></div><p className="muted">Число — обращения о проблемах; цвет — максимальный индекс внимания. Темы определяются серверными правилами.</p></section><section className="server-panel"><h2>Повторяющиеся проблемы</h2>{data.recurring.length ? data.recurring.map(item => <button className="server-related" key={item.id} onClick={() => onOpen(item.id)}><strong>{item.title}</strong><span>{item.total} связанных обращений · затронуто {item.affected} чел.</span></button>) : <p className="muted">Подтверждённых связей между обращениями пока нет.</p>}</section></div>}
    {data && section === 'effect' && <><div className="server-metrics"><article className="server-metric"><span>Подтверждённый денежный эффект</span><strong>{formatNumber(data.summary.confirmed_effect)} ₸</strong></article><article className="server-metric"><span>Подтверждено идей</span><strong>{data.summary.implemented}</strong></article><article className="server-metric"><span>Цена ожидания, в месяц</span><strong>{formatNumber(data.insights.impact.cost_month)} ₸</strong></article><article className="server-metric"><span>Пилотов в работе</span><strong>{data.insights.pilots.running}</strong></article></div><section className="server-panel"><h2>Потенциальный эффект</h2><p className="muted">Интерактивная оценка. Прогноз не включается в подтверждённый результат.</p><ROICalculator/></section></>}
  </section>;
}

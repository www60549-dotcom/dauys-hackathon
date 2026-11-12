import {lazy, Suspense, useMemo, useState} from 'react';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {Building2, CalendarDays, Check, ChevronDown, Clock3, Inbox, Zap} from 'lucide-react';
import {CountUp} from './CountUp';
import {NavigationTabs} from './NavigationTabs';
import {AppealDistributionMap} from './AppealDistributionMap';
import {RepeatedProblems} from './RepeatedProblems';
import {ImprovementBoard} from './ImprovementBoard';
import {ROICalculator} from './ROICalculator';
import {cn, formatNumber} from '../lib/utils';
import {departments, isCompleted, type Appeal} from '../types';
import {buildAppealCalendar, formatAppealCount, selectAnalyticsAppeals} from '../lib/appealCalendar';
import {buildAppealDynamics, buildMonthlyAppealDynamics} from '../lib/appealDynamics';

const BklitAppealBarChart = lazy(() => import('./BklitAppealBarChart'));
const AppealQueueChart = lazy(() => import('./AppealQueueChart'));
const BklitAppealHeatmap = lazy(() => import('./BklitAppealHeatmap'));
const calendarDate = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'short', year: 'numeric'});
const topics = [
  {id: 'overview', label: 'Общая сводка'},
  {id: 'problems', label: 'Проблемные зоны'},
  {id: 'impact', label: 'Эффект и экономия'},
] as const;
type Topic = typeof topics[number]['id'];

export function Analytics({appeals, onOpen}: {appeals: Appeal[]; onOpen: (id: string) => void}) {
  const [topic, setTopic] = useState<Topic>('overview');
  const [period, setPeriod] = useState(30);
  const [department, setDepartment] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const reduced = !!useReducedMotion();
  const data = useMemo(() => {
    const now = Date.now();
    const items = selectAnalyticsAppeals(appeals, {now, periodDays: period, department});
    const replies = items.flatMap(item => item.firstResponseHours === null ? [] : [item.firstResponseHours]);
    const confirmed = items.filter(item => item.status === 'closed' && item.kind !== 'praise');
    return {items, now, monthly: buildMonthlyAppealDynamics(items, now, period), dynamics: buildAppealDynamics(items, now, period), calendar: buildAppealCalendar(items, now),
      firstReply: replies.length ? replies.reduce((sum, value) => sum + value, 0) / replies.length : null,
      resolved: items.filter(item => ['resolved', 'closed'].includes(item.status) && item.kind !== 'praise').length,
      overdue: items.filter(item => !isCompleted(item.status) && item.dueAt < now).length,
      confirmed, savedHours: confirmed.reduce((sum, item) => sum + (item.measurement?.hoursPerMonth ?? 0), 0),
      measured: confirmed.filter(item => item.measurement).length,
    };
  }, [appeals, period, department]);
  const metrics = [
    {label: 'Поступило', value: data.items.length, icon: Inbox, color: 'blue', suffix: ''},
    {label: 'Решено', value: data.resolved, icon: Check, color: 'green', suffix: ''},
    {label: 'Время ответа', value: data.firstReply, icon: Zap, color: 'blue', suffix: ' ч'},
    {label: 'Просрочено', value: data.overdue, icon: Clock3, color: 'orange', suffix: ''},
  ];
  return <section className="analytics-page ux-analytics" aria-labelledby="analytics-title">
    <div className="workspace-page-heading analytics-page-heading"><div><h1 id="analytics-title">Аналитика и итоги</h1><p>Выберите, что хотите узнать.</p></div><div className="analytics-filters"><label className="select-field"><CalendarDays size={17}/><span className="sr-only">Период аналитики</span><select value={period} onChange={event => setPeriod(+event.target.value)}><option value={30}>Последние 30 дней</option><option value={7}>Последние 7 дней</option><option value={180}>Последние 180 дней</option><option value={0}>Всё время</option></select></label><label className="select-field"><Building2 size={17}/><span className="sr-only">Подразделение аналитики</span><select value={department} onChange={event => setDepartment(event.target.value)}><option value="">Все подразделения</option>{departments.map(value => <option key={value}>{value}</option>)}</select></label></div></div>
    <NavigationTabs id="analytics-topic" tabs={topics} value={topic} onChange={setTopic} label="Темы аналитики" layoutId="activeAnalyticsTopic" className="analytics-subtabs"/>
    <div id="analytics-topic-panel" role="tabpanel" aria-labelledby={`analytics-topic-${topic}`} tabIndex={0}>
      <AnimatePresence mode="wait" initial={false}><motion.div key={topic} initial={{opacity: 0, y: reduced ? 0 : 8}} animate={{opacity: 1, y: 0}} exit={{opacity: 0}} transition={{duration: reduced ? 0 : 0.18}}>
        {topic === 'overview' && <>
          <div className="metric-grid">{metrics.map(metric => <article className="metric-card" key={metric.label}><span className={cn('metric-icon', metric.color)}><metric.icon size={23} strokeWidth={1.6}/></span><div><h2>{metric.label}</h2><strong>{metric.value === null ? '—' : <CountUp value={metric.value} suffix={metric.suffix} decimals={metric.label === 'Время ответа' ? 1 : 0}/>}</strong></div></article>)}</div>
          <article className="dashboard-card monthly-dynamics-card bklit-studio-chart"><div className="dashboard-heading"><div><h2>Динамика по месяцам</h2><p>Обращения, созданные в выбранный период.</p></div><span className="analytics-record-count">{formatAppealCount(data.items.length)}</span></div>
            <div className="analytics-series-key"><span><i/>Поступило</span><span><i/>Из них с решением</span></div>
            {data.items.length ? <Suspense fallback={<div className="monthly-bar-canvas"/>}><BklitAppealBarChart key={`${period}-${department}`} {...data.monthly}/></Suspense> : <div className="section-empty"><Inbox size={25}/><h3>За этот период обращений нет</h3><p>Попробуйте другой период или подразделение.</p></div>}
            <p className="analytics-chart-note">Второй столбец — обращения этого месяца, уже получившие решение. Полоса — от средней до пиковой нагрузки по месяцам. «Время ответа» — среднее до первого ответа команды.</p>
          </article>
          <button className="analytics-detail-toggle" aria-expanded={showDetails} aria-controls="analytics-extra-details" onClick={() => setShowDetails(value => !value)}>{showDetails ? 'Скрыть детали' : 'Подробнее: очередь и календарь'}<ChevronDown size={17} className={showDetails ? 'is-open' : ''}/></button>
          {showDetails && <div id="analytics-extra-details" className="analytics-extra-details"><article className="dashboard-card bklit-studio-chart"><div className="dashboard-heading"><h2>Как менялась очередь</h2></div><div className="analytics-series-key"><span><i/>Ожидают команды</span><span><i/>Нужен ответ автора</span></div><Suspense fallback={<div className="queue-area-canvas"/>}><AppealQueueChart points={data.dynamics.points}/></Suspense></article><article className="dashboard-card"><div className="dashboard-heading"><h2>Календарь обращений</h2></div><div className="calendar-chart-scroll" role="region" aria-label="Календарь обращений, прокрутка по горизонтали" tabIndex={0}><Suspense fallback={null}><BklitAppealHeatmap calendar={data.calendar}/></Suspense></div><p className="analytics-chart-note">{calendarDate.format(data.calendar.start)} — {calendarDate.format(data.calendar.end)} · время Кызылорды. Цвет — 0, 1, 2, 3 или 4+ обращений за день.{data.calendar.earlierCount > 0 && ` Ранее: ${formatAppealCount(data.calendar.earlierCount)}; они учтены в общей статистике.`}</p></article></div>}
        </>}
        {topic === 'problems' && <div className="analytics-problems-layout"><AppealDistributionMap items={data.items} now={data.now} department={department} onOpen={onOpen}/><RepeatedProblems appeals={data.items} onOpen={onOpen}/></div>}
        {topic === 'impact' && <div className="analytics-impact-layout"><div className="confirmed-result-summary"><div><span>Подтверждено авторами</span><strong>{data.confirmed.length}</strong></div><div><span>Экономия по замерам</span><strong>{formatNumber(data.savedHours, 1)} ч/мес.</strong></div><p>Замеров: {data.measured}. Прогнозы калькулятора учитываются отдельно.</p></div><ImprovementBoard appeals={data.items} onOpen={onOpen}/><ROICalculator/></div>}
      </motion.div></AnimatePresence>
    </div>
  </section>;
}

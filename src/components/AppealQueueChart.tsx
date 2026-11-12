import {curveMonotoneX} from 'd3-shape';
import {AreaChart, Area} from '@/components/charts/area-chart';
import {Grid} from '@/components/charts/grid';
import {XAxis} from '@/components/charts/x-axis';
import {YAxis} from '@/components/charts/y-axis';
import {ChartTooltip} from '@/components/charts/tooltip';
import type {AppealDynamicsPoint} from '@/lib/appealDynamics';

const dateLabel = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'short', timeZone: 'Asia/Qyzylorda'});

export default function AppealQueueChart({points}: {points: AppealDynamicsPoint[]}) {
  return <div className="bklit-studio-chart queue-area-chart">
    <AreaChart data={points} aspectRatio="auto" className="queue-area-canvas" animationDuration={1100}
      animationEasing="cubic-bezier(0.85, 0, 0.15, 1)">
      <Grid horizontal />
      <Area dataKey="queue" curve={curveMonotoneX} fillOpacity={0.18} strokeWidth={2} fadeBottom={100} />
      <Area dataKey="waiting" fill="var(--chart-2)" curve={curveMonotoneX} fillOpacity={0.15} strokeWidth={2} fadeBottom={100} />
      <YAxis formatValue={value => Number.isInteger(value) ? String(value) : ''} />
      <XAxis labels={points.map(point => dateLabel.format(point.date))} />
      <ChartTooltip rows={point => [
        {label: 'Ожидают работы команды', value: Number(point.queue), color: 'var(--chart-1)'},
        {label: 'Нужен ответ автора', value: Number(point.waiting), color: 'var(--chart-2)'},
      ]} />
    </AreaChart>
  </div>;
}

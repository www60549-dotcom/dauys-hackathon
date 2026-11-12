import {BarChart} from '@/components/charts/bar-chart';
import {Bar} from '@/components/charts/bar';
import {BarXAxis} from '@/components/charts/bar-x-axis';
import {Grid} from '@/components/charts/grid';
import {ReferenceArea} from '@/components/charts/reference-area';
import {YAxis} from '@/components/charts/y-axis';
import {ChartTooltip} from '@/components/charts/tooltip';
import type {AppealDynamicsPoint} from '@/lib/appealDynamics';

const countLabel = (value: number) => Number.isInteger(value) ? String(value) : '';

export default function BklitAppealBarChart({points, average, peak}: {
  points: AppealDynamicsPoint[]; average: number; peak: number;
}) {
  return <div className="bklit-studio-chart appeal-bar-chart">
    <BarChart data={points} xDataKey="month" animationDuration={1100} aspectRatio="auto" className="monthly-bar-canvas" barWidth={points.length < 4 ? 38 : undefined}
      animationEasing="cubic-bezier(0.85, 0, 0.15, 1)"
      enterTransition={{type: 'tween', duration: 1.1, ease: [0.85, 0, 0.15, 1]}} barGap={0.2}>
      <Grid horizontal />
      <ReferenceArea y1={average} y2={peak}
        fill="color-mix(in oklch, var(--chart-foreground-muted) 15%, transparent)"
        fillOpacity={1} pattern="none" patternColor="var(--chart-foreground-muted)"
        stroke="var(--chart-foreground-muted)" strokeStyle="dashed" strokeDasharray="4,4"
        fadeEdges={true} fadeEdgesLength={10} axisLabelColor="var(--chart-1)"
        showMarkers={true} markerColor="var(--chart-1)" yAxisId="left" />
      <Bar dataKey="received" lineCap="round" fill="var(--chart-1)" fadedOpacity={0.3} groupGap={4} />
      <Bar dataKey="withSolution" lineCap="round" fill="var(--chart-2)" fadedOpacity={0.3} groupGap={4} />
      <YAxis yAxisId="left" formatValue={countLabel} />
      <YAxis yAxisId="right" orientation="right" formatValue={countLabel} />
      <BarXAxis />
      <ChartTooltip rows={point => [
        {label: 'Поступило', value: Number(point.received), color: 'var(--chart-1)'},
        {label: 'Из них с решением', value: Number(point.withSolution), color: 'var(--chart-2)'},
      ]} />
    </BarChart>
  </div>;
}

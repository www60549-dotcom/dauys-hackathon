import {
  HeatmapCells,
  HeatmapChart,
  HeatmapInteractionBoundary,
  HeatmapInteractionProvider,
  HeatmapSeparator,
  HeatmapTooltip,
  HeatmapXAxis,
  HeatmapYAxis,
} from '@/components/charts/heatmap';
import {formatAppealCount} from '@/lib/appealCalendar';
import type {AppealCalendarData} from '@/lib/appealCalendar';

const heatmapLevelStyles = [
  {color: 'var(--chart-scale-01)', fillMode: 'solid', pattern: 'none'},
  {color: 'var(--chart-scale-02)', fillMode: 'solid', pattern: 'none'},
  {color: 'var(--chart-scale-03)', fillMode: 'solid', pattern: 'none'},
  {color: 'var(--chart-scale-04)', fillMode: 'solid', pattern: 'none'},
  {color: 'var(--chart-scale-05)', fillMode: 'solid', pattern: 'none'},
] as const;

export default function BklitAppealHeatmap({calendar}: {calendar: AppealCalendarData}) {
  return (
    <div className="bklit-studio-chart">
      <HeatmapInteractionProvider>
        <HeatmapInteractionBoundary>
          <div className="flex w-full flex-col items-stretch gap-3">
            <HeatmapChart
              data={calendar.columns}
              gap={2}
              levelStyles={heatmapLevelStyles}
              animationDuration={1100}
              enterTransition={{type: 'tween', duration: 1.1, ease: [0.85, 0, 0.15, 1]}}
              enterStaggerScale={1}
            >
              <HeatmapCells cornerRadius={2} />
              <HeatmapXAxis />
              <HeatmapYAxis />
              <HeatmapTooltip formatLabel={formatAppealCount} />
              <HeatmapSeparator
                groupBy="quarter"
                showLabels
                labelClassName="text-black dark:text-white"
                stroke="var(--border)"
                spacing={12}
                startOffset={14}
              />
            </HeatmapChart>
          </div>
        </HeatmapInteractionBoundary>
      </HeatmapInteractionProvider>
    </div>
  );
}

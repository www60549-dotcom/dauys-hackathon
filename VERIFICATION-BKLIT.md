# Bklit Studio area chart

Историческая проверка первой версии. Диаграмма устройств позднее заменена компактной очередью обращений; текущее состояние — в `VERIFICATION-ANALYTICS.md`.

Дата: 12 ноября 2026.

## Источники

- Studio: https://bklit.com/studio?s=v1.NrBME4HYBoCIEMBOBTeA6ANsg5sgdgCYA%2BSqaARogK4DOAFrALqNA
- Официальный реестр: https://bklit.com/r/area-chart.json
- Навык: `.agents/skills/bklit-ui/SKILL.md`, установлен через `npx skills add bklit/bklit-ui --skill bklit-ui --agent codex --copy --yes`.

Через CLI shadcn установлены `@bklit/area-chart`, `@bklit/reference-area`, `@bklit/y-axis` вместе с зависимостями. Названия свойств сверены с установленными TypeScript-интерфейсами. Исходники реестра не переписаны.

## Применённая конфигурация

- Данные: ровно 12 точек, даты 1–12 января 2024; обе формулы desktop/mobile перенесены из запроса без случайных значений.
- `Grid horizontal`, `ReferenceArea` 160–220 с указанными fill, dashed stroke, fadeEdges и маркерами.
- Две `Area`: `curveNatural`, fillOpacity 0.3, strokeWidth 2, fadeEdges left/right 15, fadeBottom 100, showLine и showHighlight.
- Desktop использует штатный `var(--chart-1)`, mobile — `var(--chart-2)`. Сохранены цвета официальной темы.
- Оси Y слева и справа включены согласно списку видимых слоёв; обе серии сохраняют стандартную левую шкалу. Правая ось отражает основную шкалу через штатный fallback `useYScale`.
- `XAxis` и `ChartTooltip` подключены. Нет Background, Weekends, Deadline, TrendLine, ChartLegend, ChartBrush в дереве диаграммы.
- `animationDuration=1100`, `animationEasing="cubic-bezier(0.85, 0, 0.15, 1)"`. В установленном `animation.ts` штатный enterTransition уже равен `{type: "tween", duration: 1.1, ease: [0.85, 0, 0.15, 1]}`; shell применяет его без дополнительного переопределения.
- Нет дополнительных настроек series, размеров, границ, легенды или элементов управления диаграммой. Внешние заголовок и подпись обозначают демонстрационный характер набора.

## Интеграция

Компонент `src/components/BklitStudioAreaChart.tsx` открывается в аналитике через React.lazy. Штатный шаблон генератора кнопки и его ненужные зависимости удалены. Исходные стили Dauys и функции форматирования восстановлены после инициализации shadcn. Токены реестра ограничены `.bklit-studio-chart`; ChartTooltip и оси создают порталы внутри контейнера диаграммы, поэтому сохраняют тему.

Добавлены декларации типов d3 для строгой проверки TypeScript. Существующие гистограмма, heatmap, фильтры и вычисления обращений сохранены; демонстрационные данные устройств с ними не смешиваются.

## Проверки и ограничения

- `npm run build`: строгая проверка TypeScript и production-сборка выполнены успешно.
- `npm test`: все 23 существующих проверки проходят.
- Проверены локальные импорты, поддерживаемые свойства, видимые слои и стандартный переход по исходникам реестра.
- Токены подключены CSS-импортом в общий вход Tailwind, а не отдельной JS-точкой: в итоговом CSS проверено наличие `text-chart-label`, `bg-chart-tooltip-background`, `text-chart-tooltip-foreground`. Это сохраняет цвета осей и Tooltip после сборки. Базовые popover/border-переменные shadcn ограничены контейнером графика.
- Браузерная визуальная сверка со Studio не выполнялась: доступ к локальному сайту для браузерной проверки ранее был отклонён. Пиксельное совпадение и работу Tooltip на реальном устройстве не заявляем проверенными.
- Сборка сохраняет прежнее предупреждение о крупном блоке Three.js; это не ошибка сборки.

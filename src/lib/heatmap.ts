import type {Appeal} from '../types';

export const heatmapTones = {
  none: {background: '#f1f5f9', color: '#0f172a', label: 'Не указан'},
  low: {background: '#e2e8f0', color: '#0f172a', label: 'Низкий'},
  medium: {background: '#dbeafe', color: '#0f172a', label: 'Средний'},
  high: {background: '#991b1b', color: '#ffffff', label: 'Высокий'},
} as const;

export function summarizeHeatmap(items: Pick<Appeal, 'priority' | 'category'>[]) {
  const priority = items.some(item => item.priority === 'high') ? 'high'
    : items.some(item => item.priority === 'medium') ? 'medium'
    : items.some(item => item.priority === 'low') ? 'low' : 'none';
  const categories = [...new Set(items.map(item => item.category))].sort((a, b) => a.localeCompare(b, 'ru'));
  return {count: items.length, priority, categories, ...heatmapTones[priority]};
}

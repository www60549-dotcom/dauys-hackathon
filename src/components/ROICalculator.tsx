import {useState} from 'react';
import {DEFAULT_ESTIMATE, estimateImpact} from '../lib/innovation';
import {formatNumber} from '../lib/utils';
import type {ImpactEstimate} from '../types';

export function ROICalculator() {
  const [draft, setDraft] = useState<ImpactEstimate>({...DEFAULT_ESTIMATE});
  const update = (key: keyof ImpactEstimate, value: number) => setDraft(current => ({...current, [key]: value}));
  let result: ReturnType<typeof estimateImpact> | null = null;
  try { result = estimateImpact(draft); } catch { /* Invalid assumptions are shown below, never turned into savings. */ }
  return <section className="dashboard-card standalone-roi" aria-labelledby="roi-title"><div className="dashboard-heading"><div><h2 id="roi-title">Какой эффект может дать идея?</h2><p>Оцените стоимость времени при своих допущениях.</p></div></div>
    <div className="roi-layout"><div className="roi-inputs">
      <label>Экономия на человека в день<strong>{draft.minutesPerDay} мин</strong><input type="range" min="5" max="60" step="1" value={draft.minutesPerDay} onChange={event => update('minutesPerDay', +event.target.value)}/></label>
      <label>Сколько сотрудников затронуто<strong>{draft.employees} чел.</strong><input type="range" min="1" max="150" step="1" value={draft.employees} onChange={event => update('employees', +event.target.value)}/></label>
      <div className="form-grid"><label className="form-field">Стоимость часа, ₸<input type="number" min="0" max="1000000" value={Number.isFinite(draft.hourlyRate) ? draft.hourlyRate : ''} onChange={event => update('hourlyRate', event.target.value === '' ? NaN : +event.target.value)}/></label><label className="form-field">Рабочих дней в году<input type="number" min="1" max="366" value={Number.isFinite(draft.workdays) ? draft.workdays : ''} onChange={event => update('workdays', event.target.value === '' ? NaN : +event.target.value)}/></label></div>
    </div><div className="roi-projection" aria-live="polite" aria-atomic="true"><span>Прогноз за год</span><strong>{result ? `${formatNumber(result.moneyYear)} ₸` : '—'}</strong><p>{result ? `${formatNumber(result.hoursYear, 1)} часов потенциально высвобожденного времени` : 'Проверьте стоимость часа и число рабочих дней.'}</p><small>Прогноз не включается в подтверждённую экономию.</small></div></div>
  </section>;
}

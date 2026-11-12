import type {ApiAppeal, ApiImpact, BusinessFeatures, Pilot, PilotCommand, SessionUser} from '../api/contracts';
import {dateForInput} from './appealDraft';

export interface ImpactDraft {people: string; minutes: string; occurrences: string; rate: string}
export interface PilotDraft {id: number | null; version: number | null; state: 'planned'|'running'|null; hypothesis: string; scope: string; metric: string; unit: string; baseline: string; target: string; direction: 'decrease' | 'increase'; owner: string; deadline: string; actual: string; conclusion: string}
export interface BusinessDraft {id: string; baseVersion: number; dirty: boolean; mode: 'impact' | 'pilot' | null; impact: ImpactDraft; pilot: PilotDraft}
export function activePilot(features: BusinessFeatures): Pilot | undefined {return features.pilots.find(pilot => pilot.state !== 'evaluated');}
export function createBusinessDraft(item: ApiAppeal, features: BusinessFeatures, user: SessionUser): BusinessDraft {
  const cost=features.impact, pilot=activePilot(features);
  return {id:item.id,baseVersion:features.appeal_version,dirty:false,mode:null,
    impact:{people:String(cost?.people ?? item.affected),minutes:cost ? String(cost.minutes) : '',occurrences:cost ? String(cost.occurrences_month) : '',rate:String(cost?.hourly_rate ?? 0)},
    pilot:{id:pilot?.id ?? null,version:pilot?.version ?? null,state:pilot?.state === 'running' ? 'running' : pilot ? 'planned' : null,hypothesis:pilot?.hypothesis ?? '',scope:pilot?.scope ?? '',metric:pilot?.metric ?? '',unit:pilot?.unit ?? '',baseline:pilot ? String(pilot.baseline) : '',target:pilot ? String(pilot.target) : '',direction:pilot?.direction ?? 'decrease',owner:pilot?.owner_id ?? (item.assignee_id || user.id),deadline:pilot?.end_at ?? dateForInput(new Date(Date.now()+7*86400000).toISOString()),actual:pilot?.actual === null || pilot?.actual === undefined ? '' : String(pilot.actual),conclusion:pilot?.conclusion ?? ''}};
}
export function reconcileBusinessDraft(draft: BusinessDraft | null,item: ApiAppeal,features: BusinessFeatures,user: SessionUser): BusinessDraft {
  return draft?.id===item.id && draft.dirty ? draft : createBusinessDraft(item,features,user);
}
function numeric(value: string,min: number,max: number,label: string): number {
  if (!value.trim()) throw new Error(`Заполните поле «${label}».`);
  const number=Number(value);
  if (!Number.isFinite(number) || number<min || number>max) throw new Error(`Проверьте поле «${label}».`);
  return number;
}
export function impactInput(draft: ImpactDraft): ApiImpact {
  const people=numeric(draft.people,1,100000,'Затронуто сотрудников');
  if (!Number.isInteger(people)) throw new Error('Число сотрудников должно быть целым.');
  return {people,minutes:numeric(draft.minutes,0,1440,'Минуты'),occurrences_month:numeric(draft.occurrences,0,1000,'Случаи в месяц'),hourly_rate:numeric(draft.rate,0,1000000,'Стоимость часа')};
}
export function estimateWaiting(draft: ImpactDraft): {hours: number; money: number} | null {
  try {const input=impactInput(draft);const hours=input.people*input.minutes*input.occurrences_month/60;return {hours,money:hours*input.hourly_rate};} catch {return null;}
}
export function pilotCommand(draft: BusinessDraft,action: 'create'|'save'|'start'|'finish'): PilotCommand {
  const value=draft.pilot, common={expected_appeal_version:draft.baseVersion};
  if (action!=='create' && (value.id===null || value.version===null)) throw new Error('Обновите сведения о пилоте.');
  if (action==='start') return {...common,action,id:value.id!,version:value.version!};
  if (action==='finish') {
    if (value.conclusion.trim().length<10) throw new Error('Опишите вывод пилота: от 10 символов.');
    return {...common,action,id:value.id!,version:value.version!,actual:numeric(value.actual,0,1e9,'Фактическая метрика'),conclusion:value.conclusion.trim()};
  }
  const plan={hypothesis:value.hypothesis.trim(),scope:value.scope.trim(),metric:value.metric.trim(),unit:value.unit.trim(),baseline:numeric(value.baseline,0,1e9,'До пилота'),target:numeric(value.target,0,1e9,'Цель'),direction:value.direction,owner_id:value.owner,end_at:value.deadline};
  if (plan.hypothesis.length<10 || plan.scope.length<3 || plan.metric.length<3 || !plan.unit || !plan.owner_id || !/^\d{4}-\d{2}-\d{2}$/.test(plan.end_at)) throw new Error('Заполните изменение, участников, показатель, единицу, ответственного и дату.');
  if (!(plan.direction==='decrease' ? plan.target<plan.baseline : plan.target>plan.baseline)) throw new Error('Цель должна улучшать исходный показатель.');
  return action==='create' ? {...common,...plan,action} : {...common,...plan,action,id:value.id!,version:value.version!};
}
/** Keep GET URLs inside the default HTTP header buffer, including Unicode. */
export function similarSearchText(title: string,description: string): string {return Array.from(`${title} ${description}`.replace(/\s+/g,' ').trim()).slice(0,240).join('');}

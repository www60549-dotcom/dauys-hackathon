import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {api,ApiError} from '../api/client';
import type {ApiAppeal,Metadata,SessionUser} from '../api/contracts';
import {activePilot,createBusinessDraft,reconcileBusinessDraft,estimateWaiting,impactInput,pilotCommand,type BusinessDraft,type ImpactDraft,type PilotDraft} from '../lib/businessDraft';
import {formatDate} from '../lib/utils';
const numberFormat=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}),metricFormat=new Intl.NumberFormat('ru-RU',{maximumSignificantDigits:12});
const formatNumber=(value:number)=>numberFormat.format(value),formatMetric=(value:number)=>metricFormat.format(value);
import {PrimaryButton} from './PrimaryButton';

interface Props {item:ApiAppeal;user:SessionUser;meta?:Metadata;externalBlocked:boolean;onChanged:()=>Promise<unknown>;onBusyChange:(value:boolean)=>void;onDirtyChange:(value:boolean)=>void;onActiveChange:(value:boolean)=>void}
export function BusinessFeaturePanel({item,user,meta,externalBlocked,onChanged,onBusyChange,onDirtyChange,onActiveChange}:Props) {
  const client=useQueryClient();
  const key=['workspace',user.id,'features',item.id];
  const query=useQuery({queryKey:key,queryFn:({signal})=>api.features(item.id,signal)});
  const [draft,setDraft]=useState<BusinessDraft|null>(null),[pending,setPending]=useState(false),[failure,setFailure]=useState(''),[conflict,setConflict]=useState(false);
  const lock=useRef(false),data=query.data;
  useEffect(()=>{if(data)setDraft(current=>reconcileBusinessDraft(current,item,data,user));},[item.id,data?.appeal_version]);
  useEffect(()=>{onDirtyChange(!!draft?.dirty);},[draft?.dirty,onDirtyChange]);
  useEffect(()=>{onActiveChange(!!data && !!activePilot(data));},[data,onActiveChange]);
  useEffect(()=>()=>{onBusyChange(false);onDirtyChange(false);onActiveChange(false);},[onBusyChange,onDirtyChange,onActiveChange]);
  const latestVersion=Math.max(item.version,data?.appeal_version ?? 0);
  const stale=!!draft && (draft.baseVersion!==latestVersion || conflict);
  const fieldBlocked=pending || externalBlocked;
  const impactBlocked=fieldBlocked || !!draft?.dirty && draft.mode!=='impact';
  const pilotBlocked=fieldBlocked || !!draft?.dirty && draft.mode!=='pilot';
  const changeImpact=(name:keyof ImpactDraft,value:string)=>setDraft(current=>current?{...current,dirty:true,mode:'impact',impact:{...current.impact,[name]:value}}:current);
  const changePilot=(name:keyof PilotDraft,value:string)=>setDraft(current=>current?{...current,dirty:true,mode:'pilot',pilot:{...current.pilot,[name]:value}}:current);
  const execute=async(operation:()=>Promise<unknown>)=>{
    if(lock.current)return;lock.current=true;setPending(true);onBusyChange(true);setFailure('');
    try {await operation();setDraft(current=>current?{...current,dirty:false,mode:null}:current);setConflict(false);onDirtyChange(false);await onChanged();}
    catch(error){setFailure(error instanceof Error?error.message:'Не удалось сохранить.');if(error instanceof ApiError && error.status===409){setConflict(true);await onChanged();}}
    finally{lock.current=false;setPending(false);onBusyChange(false);}
  };
  const reload=async()=>{
    if(lock.current)return;lock.current=true;setPending(true);onBusyChange(true);setFailure('');
    try{const snapshot=await api.features(item.id);client.setQueryData(key,snapshot);setDraft(createBusinessDraft(item,snapshot,user));setConflict(false);onDirtyChange(false);await onChanged();}
    catch(error){setFailure(error instanceof Error?error.message:'Не удалось обновить данные.');}
    finally{lock.current=false;setPending(false);onBusyChange(false);}
  };
  if(query.isPending)return <p className="muted" role="status">Загружаем оценку и пилоты…</p>;
  if(query.error && !data)return <p className="form-error" role="alert">{query.error.message} <button className="text-button" onClick={()=>{void query.refetch();}}>Повторить</button></p>;
  if(!data || !draft)return null;
  const estimate=estimateWaiting(draft.impact),pilot=activePilot(data);
  return <section className="business-features" aria-label="Оценка и проверка улучшения" aria-busy={pending}>
    {query.error && <p className="form-error" role="status">Не удалось обновить данные. Введённые значения сохранены в форме. <button type="button" className="text-button" onClick={()=>{void query.refetch();}}>Повторить</button></p>}
    {stale && <div className="appeal-conflict" role="alert"><h3>Данные карточки изменились</h3><p>Ваши значения остались в полях. Скопируйте нужные правки перед загрузкой текущих данных.</p><details><summary>Сейчас сохранено</summary><p>Оценка: {data.impact?`${formatNumber(data.impact.hours_month)} ч/мес., ${formatNumber(data.impact.cost_month)} ₸/мес.`:'не заполнена'}</p><p>Пилот: {pilot?`${pilot.hypothesis} · ${pilot.state==='running'?'в работе':'подготовлен'}`:'активного пилота нет'}</p></details><button className="button" disabled={pending} onClick={()=>{void reload();}}>Загрузить актуальные данные</button><small>Введённые значения будут заменены сохранёнными.</small></div>}
    <details className="business-section"><summary><span>Цена ожидания</span><small>{data.impact?`${formatNumber(data.impact.hours_month)} ч/мес.`:'Оценка потерь времени'}</small></summary>
      <p className="muted">Сколько времени проблема отнимает за месяц. Это расчётная оценка, она не входит в подтверждённую экономию.</p>
      {data.impact && <div className="business-metrics"><div><strong>{formatNumber(data.impact.hours_month)} ч</strong><span>в месяц</span></div><div><strong>{data.impact.hourly_rate?`${formatNumber(data.impact.cost_month)} ₸`:'Стоимость не оценена'}</strong><span>{data.impact.hourly_rate?'потенциальные потери за месяц':'учитывается только время'}</span></div></div>}
      {data.permissions.can_assess || draft.dirty && draft.mode==='impact' ? <form className="create-form" onSubmit={event=>{event.preventDefault();if(impactBlocked||stale||!data.permissions.can_assess)return;void execute(()=>api.saveImpact(item.id,{...impactInput(draft.impact),expected_appeal_version:draft.baseVersion}));}}>
        <div className="form-grid">{([{key:'people',label:'Затронуто сотрудников',min:1,max:100000,step:'1'},{key:'minutes',label:'Минут на один случай',min:0,max:1440,step:'any'},{key:'occurrences',label:'Случаев за месяц',min:0,max:1000,step:'any'},{key:'rate',label:'Стоимость часа, ₸',min:0,max:1000000,step:'any'}] as const).map(field=><label className="form-field" key={field.key}>{field.label}<input type="number" required min={field.min} max={field.max} step={field.step} value={draft.impact[field.key]} disabled={impactBlocked} onChange={event=>changeImpact(field.key,event.target.value)}/></label>)}</div>
        <small>Если стоимость часа неизвестна, оставьте 0. Оценка считается по числу сотрудников, минутам и частоте случаев.</small>
        {estimate && <p className="business-preview">По введённым данным: <strong>{formatNumber(estimate.hours)} ч/мес.</strong>{Number(draft.impact.rate)>0 && ` · ${formatNumber(estimate.money)} ₸/мес.`}</p>}
        <PrimaryButton type="submit" disabled={impactBlocked||stale||!draft.dirty||!data.permissions.can_assess}>Сохранить оценку</PrimaryButton>
      </form> : !data.impact && <p className="muted">Оценка ещё не заполнена. Её может добавить автор до начала обработки или ответственный.</p>}
    </details>
    <details className="business-section"><summary><span>Пилот улучшения</span><small>{pilot?(pilot.state==='running'?'Проверяем в работе':'План подготовлен'):'Проверка результата на практике'}</small></summary>
      <p className="muted">Небольшая проверка изменения: фиксируем исходную метрику, цель и измеренный результат.</p>
      {pilot && <article className="pilot-summary"><h4>{pilot.hypothesis}</h4><p>{pilot.scope}</p><div className="business-metrics"><div><strong>{formatMetric(pilot.baseline)} → {formatMetric(pilot.target)} {pilot.unit}</strong><span>{pilot.metric}</span></div><div><strong>{pilot.owner}</strong><span>Итоги до {formatDate(Date.parse(pilot.end_at+'T12:00:00+05:00'))}</span></div></div></article>}
      {data.permissions.can_pilot || draft.dirty && draft.mode==='pilot' ? draft.pilot.state==='running' ? <form className="create-form" onSubmit={event=>{event.preventDefault();if(pilotBlocked||stale||!data.permissions.can_pilot)return;void execute(()=>api.savePilot(item.id,pilotCommand(draft,'finish')));}}>
        <p className="muted">План запущенного пилота зафиксирован. Укажите фактический результат и вывод.</p>
        <label className="form-field">Фактическое значение показателя<input type="number" required min={0} max={1e9} step="any" value={draft.pilot.actual} disabled={pilotBlocked} onChange={event=>changePilot('actual',event.target.value)}/></label>
        <label className="form-field">Что показала проверка?<textarea rows={3} required minLength={10} maxLength={3000} value={draft.pilot.conclusion} disabled={pilotBlocked} onChange={event=>changePilot('conclusion',event.target.value)}/></label>
        <PrimaryButton type="submit" disabled={pilotBlocked||stale||!data.permissions.can_pilot}>Подвести итоги пилота</PrimaryButton>
      </form> : <form className="create-form" onSubmit={event=>{event.preventDefault();if(pilotBlocked||stale||!data.permissions.can_pilot)return;void execute(()=>api.savePilot(item.id,pilotCommand(draft,draft.pilot.id===null?'create':'save')));}}>
        <label className="form-field">Какое изменение проверяем?<textarea rows={2} required minLength={10} maxLength={3000} value={draft.pilot.hypothesis} disabled={pilotBlocked} onChange={event=>changePilot('hypothesis',event.target.value)}/></label>
        <label className="form-field">На ком или где проверяем?<input required minLength={3} maxLength={500} value={draft.pilot.scope} disabled={pilotBlocked} onChange={event=>changePilot('scope',event.target.value)}/></label>
        <div className="form-grid"><label className="form-field">Показатель<input required minLength={3} maxLength={200} value={draft.pilot.metric} disabled={pilotBlocked} onChange={event=>changePilot('metric',event.target.value)}/></label><label className="form-field">Единица измерения<input required maxLength={40} value={draft.pilot.unit} disabled={pilotBlocked} onChange={event=>changePilot('unit',event.target.value)}/></label></div>
        <div className="form-grid"><label className="form-field">До пилота<input type="number" required min={0} max={1e9} step="any" value={draft.pilot.baseline} disabled={pilotBlocked} onChange={event=>changePilot('baseline',event.target.value)}/></label><label className="form-field">Цель<input type="number" required min={0} max={1e9} step="any" value={draft.pilot.target} disabled={pilotBlocked} onChange={event=>changePilot('target',event.target.value)}/></label></div>
        <label className="form-field">Какой результат лучше?<select value={draft.pilot.direction} disabled={pilotBlocked} onChange={event=>changePilot('direction',event.target.value)}><option value="decrease">Значение должно уменьшиться</option><option value="increase">Значение должно увеличиться</option></select></label>
        <div className="form-grid"><label className="form-field">Ответственный за проверку<select required value={draft.pilot.owner} disabled={pilotBlocked} onChange={event=>changePilot('owner',event.target.value)}><option value="">Выберите сотрудника</option>{meta?.executors.map(person=><option value={person.id} key={person.id}>{person.name}</option>)}</select></label><label className="form-field">Дата итогов<input type="date" required value={draft.pilot.deadline} disabled={pilotBlocked} onChange={event=>changePilot('deadline',event.target.value)}/></label></div>
        <div className="business-actions"><PrimaryButton type="submit" disabled={pilotBlocked||stale||!draft.dirty||!data.permissions.can_pilot}>{draft.pilot.id===null?'Создать план пилота':'Сохранить план'}</PrimaryButton>{draft.pilot.state==='planned' && <button type="button" className="button" disabled={pilotBlocked||stale||draft.dirty||!data.permissions.can_pilot} onClick={()=>{void execute(()=>api.savePilot(item.id,pilotCommand(draft,'start')));}}>Запустить пилот</button>}</div>
      </form> : !pilot && <p className="muted">Ответственный может создать план проверки для открытого обращения.</p>}
      {pilot && <p className="business-hint">Сначала подведите итоги пилота, затем фиксируйте окончательное решение обращения.</p>}
      {data.pilots.filter(value=>value.state==='evaluated').map(value=><article className="pilot-result" key={value.id}><span>{value.goal_met===null?'Нет измерения':value.goal_met?'Цель достигнута':'Цель не достигнута'}</span><h4>{value.hypothesis}</h4><strong>{formatMetric(value.baseline)} → {value.actual===null?'—':formatMetric(value.actual)} {value.unit}</strong><p>{value.conclusion}</p><small>{value.metric} · цель {formatMetric(value.target)} {value.unit} · {value.owner}</small></article>)}
    </details>
    {failure && <p className="form-error" role="alert">{failure}</p>}
  </section>;
}

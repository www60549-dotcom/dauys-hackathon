import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowUpRight,Search} from 'lucide-react';
import {api} from '../api/client';
import {similarSearchText} from '../lib/businessDraft';
import {statusLabels} from '../types';

export function SimilarAppeals({title,description,userId,active=true,exclude}: {title:string;description:string;userId:string;active?:boolean;exclude?:string}) {
  const text=similarSearchText(title,description);
  const [query,setQuery]=useState('');
  useEffect(()=>{const timer=setTimeout(()=>setQuery(text),400);return()=>clearTimeout(timer);},[text]);
  const ready=active && query.length>=10 && text===query;
  const result=useQuery({queryKey:['workspace',userId,'similar',query,exclude],queryFn:({signal})=>api.similar(query,exclude,signal),enabled:ready,staleTime:30000});
  if (!active || text.length<10) return null;
  return <aside className="similar-panel" aria-label="Похожие обращения">
    <h3><Search size={18}/>Возможно, об этом уже сообщили</h3>
    {text!==query || result.isFetching ? <p className="muted" role="status">Проверяем похожие обращения…</p> : result.error ? <p className="form-error" role="status">Не удалось проверить совпадения. Можно продолжить создание. <button type="button" className="text-button" onClick={()=>{void result.refetch();}}>Повторить поиск</button></p> : result.data?.items.length ? <ul>{result.data.items.slice(0,3).map(item=><li key={item.id}><a href={`?tab=appeals&appeal=${encodeURIComponent(item.id)}`} target="_blank" rel="noopener noreferrer"><span><strong>{item.title}</strong><small>{item.department} · {statusLabels[item.status]}</small><small>{item.reasons.join(' · ')}</small></span><ArrowUpRight size={19}/><span className="sr-only">Открыть в новой вкладке</span></a></li>)}</ul> : <p className="muted">Похожих обращений пока не найдено.</p>}
    <small>Тематический поиск по словам и синонимам. Карточка откроется в новой вкладке; введённый текст останется здесь.</small>
  </aside>;
}

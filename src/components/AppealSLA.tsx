import {useQuery} from '@tanstack/react-query';
import {api} from '../api/client';
import type {SLA} from '../api/contracts';
const date=(value:string)=>new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Qyzylorda'}).format(new Date(value));
export function AppealSLA({id,userId,blocked,onRemind}:{id:string;userId:string;blocked:boolean;onRemind:()=>void}) {
 const now=Date.now();
 const {data,error}=useQuery<SLA>({queryKey:['workspace',userId,'sla',id],queryFn:({signal})=>api.sla(id,signal),refetchInterval:30000});
 // Refetching every 30 seconds keeps eligibility under server control.
 if(error)return <p className="muted" role="status">Не удалось загрузить сроки ответа.</p>;
 if(!data)return null;
 return <section className="sla-panel" aria-label="Сроки и напоминания">
 <div><strong>{data.waiting_for_author?'Ожидаем уточнение от автора':data.response_overdue?'Первый ответ просрочен':data.first_response_at?'Первый ответ получен':'Ожидаем первый ответ'}</strong>
 <p>{data.first_response_at?date(data.first_response_at):`Ответ до ${date(data.response_due_at)}`} · Решение до {date(data.resolution_due_at)}</p></div>
 {data.resolution_overdue && <p className="form-error">Срок решения истёк.</p>}
 {data.waiting_for_author && <p className="muted">Ответьте в обсуждении. Напоминания приостановлены на время уточнения.</p>}
 {data.can_remind && <button type="button" className="button button-blue" disabled={blocked} onClick={()=>{onRemind();}}>Напомнить ответственному</button>}
 {data.next_reminder_at && Date.parse(data.next_reminder_at)>now && <p className="muted">Напоминание отправлено. Повторно доступно {date(data.next_reminder_at)}.</p>}
 <small>Первый ответ — до 18 часов. Эскалация уведомляет исполнителя и администраторов.</small>
 </section>;
}

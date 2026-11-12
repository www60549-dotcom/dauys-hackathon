import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const base=process.env.BASE_URL||'http://localhost:5173';
const source=JSON.parse(await readFile(new URL('./dataset-source.json',import.meta.url),'utf8'));
const seed=JSON.parse(await readFile(new URL('../../backend/cmd/server/seed.json',import.meta.url),'utf8'));
let checks=0;
function check(value,label){assert.ok(value,label);checks++;console.log('PASS',label)}
async function versionedBody(path,body,cookie,method){
 if(body && ((method==='PATCH' && /^\/appeals\/[^/?]+$/.test(path)) || (method==='POST' && /^\/appeals\/[^/?]+\/reopen$/.test(path)))){
  const current=await fetch(base+'/api'+path.replace(/\/reopen$/,''),{headers:cookie?{Cookie:cookie}:{}});
  if(current.ok) body={...body,expected_version:(await current.json()).appeal.version};
 }
 return body;
}
async function request(path,{method='GET',body,cookie,status=200}={}){
 body=await versionedBody(path,body,cookie,method);
 const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}
 assert.equal(response.status,status,`${method} ${path}: ${text}`);
 return {response,data};
}
async function login(role){const {response}=await request('/login',{method:'POST',body:{email:role+'@dauys.local',password:'DauysDemo2026!'}});return response.headers.get('set-cookie').split(';')[0]}
const kindMap={'Проблема':'problem','Предложение':'idea','Положительный отзыв':'praise'};
const statusMap={'Новое':'new','На рассмотрении':'review','В работе':'progress','Ожидает уточнения':'waiting','Реализовано':'resolved','Отклонено':'rejected','Закрыто':'closed'};
const priorityMap={'Низкий':'low','Средний':'medium','Высокий':'high'};
check(source.synthetic&&source.rows.length===20&&seed.length===20,'source contains 20 synthetic appeals');
for(let i=0;i<20;i++){
 const original=source.rows[i],actual=seed[i];
 for(const [field,expected] of Object.entries({description:original.description,category:original.category,kind:kindMap[original.source_kind],status:statusMap[original.source_status],priority:priorityMap[original.source_priority]}))assert.equal(actual[field],expected,`${original.id}: ${field}`);
}
check(true,'all 20 seed texts, categories, types, statuses and priorities match source');
check(seed.filter(x=>x.kind==='problem').length===9&&seed.filter(x=>x.kind==='idea').length===10&&seed.filter(x=>x.kind==='praise').length===1,'source type counts: 9 problems, 10 ideas, 1 praise');
const employee=await login('employee'),executor=await login('executor'),admin=await login('admin');
const get=async(path,cookie=employee)=>(await request(path,{cookie})).data;
const meta=await get('/meta');
check(source.rows.every(row=>meta.categories.some(c=>c.name===row.category)),'all 18 source categories available in form');
for(const row of source.rows){const detail=await get('/appeals/'+row.id);assert.equal(detail.appeal.description,row.description);assert.equal(detail.appeal.category,row.category)}
check(true,'source appeals A-001 through A-020 available as saved cards');
const initial=await get('/analytics');
check(initial.types.reduce((sum,t)=>sum+t.total,0)===initial.summary.total,'type breakdown totals equal all appeals');
check(initial.summary.closed_percent===(initial.summary.total?Math.round(initial.summary.closed/initial.summary.total*1000)/10:0),'closed share uses closed status only');
const empty=await get('/analytics?department='+encodeURIComponent('Нет такого подразделения'));
check(empty.summary.total===0&&empty.summary.closed_percent===0&&empty.summary.first_response_hours===null&&empty.types.every(t=>t.total===0),'empty analytics has zero counts and unknown first response');
if(process.env.FRESH_DATASET==='1')check(initial.summary.first_response_count===2&&initial.summary.first_response_hours===6,'fresh demo dates produce a real six-hour first response');

const marker='dataset-'+Date.now();
const queueCategory='Очередь проверки '+marker;
await request('/admin/categories',{cookie:admin,method:'PATCH',body:{name:queueCategory,assignee_id:''}});
async function create(kind,category,title){return (await request('/appeals',{cookie:employee,method:'POST',status:201,body:{title:title+' '+marker,description:'Синтетический сценарий приёмки по датасету: '+marker,kind,category,department:'Проектирование',priority:'medium',affected:1,expected_effect:0}})).data.id}
const appeal=await create('problem',queueCategory,'Неясна актуальная версия инструкции');
const path='/appeals/'+appeal;
let detail=await get(path);
check(!detail.appeal.assignee_id,'unassigned category retains appeal for administrator queue');
check((await get('/notifications',admin)).some(n=>n.appeal_id===appeal),'administrator notified about unassigned appeal');
const queue=await get('/appeals?unassigned=true&q='+marker,admin);
check(queue.items.some(a=>a.id===appeal)&&queue.items.every(a=>!a.assignee_id)&&queue.counts.total===queue.total,'queue filter and counters agree');
await request(path,{cookie:executor,method:'PATCH',body:{...detail.appeal,status:'progress'},status:403});
check(true,'executor cannot manage an appeal before assignment');
await request(path,{cookie:admin,method:'PATCH',body:{...detail.appeal,status:'review',assignee_id:'executor'}});
check((await get('/notifications',executor)).some(n=>n.appeal_id===appeal),'new assignee receives notification after manual assignment');
detail=await get(path);
await request(path,{cookie:executor,method:'PATCH',body:{...detail.appeal,status:'waiting'}});
await request(path+'/comments',{cookie:executor,method:'POST',status:201,body:{body:'Пришлите пример двух версий инструкции для проверки.'}});
await request(path+'/comments',{cookie:employee,method:'POST',status:201,body:{body:'Пример уточнён: инструкция находится в двух общих папках.'}});
detail=await get(path);
check(detail.appeal.status==='waiting'&&detail.comments.length===2&&detail.history.some(h=>h.event_type==='status_changed'&&h.to_status==='waiting'&&h.from_status==='review'),'clarification, author response and status history persist');
await request(path,{cookie:executor,method:'PATCH',body:{...detail.appeal,status:'resolved',result:'Закреплена актуальная инструкция; старые версии перенесены в архив.',actual_effect:0}});
await request(path,{cookie:executor,method:'PATCH',body:{...detail.appeal,status:'closed'},status:409});
await request(path,{cookie:employee,method:'PATCH',body:{status:'closed'}});
check((await get(path)).appeal.confirmed,'A-010 flow requires author confirmation');

const rejected=await create('idea','Корпоративная среда','Небольшая зона для перерывов');
let rejectedDetail=await get('/appeals/'+rejected);
await request('/appeals/'+rejected,{cookie:executor,method:'PATCH',body:{...rejectedDetail.appeal,status:'rejected',result:'нет'},status:400});
await request('/appeals/'+rejected,{cookie:executor,method:'PATCH',body:{...rejectedDetail.appeal,status:'rejected',result:'Сейчас нет подходящего помещения. Вернёмся к вопросу при перепланировке.'}});
check((await get('/appeals/'+rejected)).appeal.result.includes('перепланировке'),'A-017 rejection requires and preserves explanation');
const board=await get('/appeals?status=done&q='+marker);
check(board.items.some(a=>a.id===appeal)&&!board.items.some(a=>a.id===rejected),'A-020 board includes completed solution and excludes refusal');

const praise=await create('praise','Корпоративная среда','Спасибо за учебную встречу');
const praiseDetail=await get('/appeals/'+praise);
await request('/appeals/'+praise,{cookie:executor,method:'PATCH',body:{...praiseDetail.appeal,status:'closed',result:'Отзыв передан организаторам обучения.'}});
const processedPraise=await get('/appeals/'+praise);
check(processedPraise.appeal.status==='closed'&&!processedPraise.appeal.confirmed,'A-018 praise can be processed without fictitious author confirmation');
check(!(await get('/appeals?status=done&q='+marker)).items.some(a=>a.id===praise),'praise does not appear as implemented improvement');

const overdue=await create('problem','Оперативность','Срок ответа смежного подразделения');
let overdueDetail=await get('/appeals/'+overdue);
const future=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
await request('/appeals/'+overdue,{cookie:executor,method:'PATCH',body:{...overdueDetail.appeal,status:'progress',due_at:future+'T23:59:59+05:00'}});
let filtered=await get('/appeals?'+new URLSearchParams({q:marker,department:'Проектирование',category:'Оперативность',kind:'problem',status:'progress',due_from:future,due_to:future}));
check(filtered.total===1&&filtered.items[0].id===overdue&&filtered.counts.total===1,'combined department/category/type/status and inclusive due-date filters');
const previous=new Date(Date.parse(future)-86400000).toISOString().slice(0,10);
check((await get('/appeals?'+new URLSearchParams({q:marker,category:'Оперативность',due_to:previous}))).total===0,'due upper boundary excludes later days');
overdueDetail=await get('/appeals/'+overdue);
await request('/appeals/'+overdue,{cookie:executor,method:'PATCH',body:{due_at:new Date(Date.now()-86400000).toISOString()}});
filtered=await get('/appeals?overdue=true&q='+marker);
check(filtered.items.length===1&&filtered.items[0].id===overdue,'overdue filter excludes closed, rejected and completed appeals');
check((await get('/appeals?q='+overdue)).items.some(a=>a.id===overdue),'search accepts appeal ID');
const month=new Date().toISOString().slice(0,7);
const monthList=await get('/appeals?'+new URLSearchParams({created_month:month,department:'Проектирование',kind:'problem'}));
const monthStats=await get('/analytics?'+new URLSearchParams({month,department:'Проектирование'}));
check(monthList.total===monthStats.types.find(t=>t.kind==='problem').total&&monthList.items.every(a=>a.created_at.startsWith(month)),'analytics type drilldown preserves creation month and department');
for(const query of ['due_from=not-a-date','due_to=2026-02-31','due_from=2026-12-01&due_to=2026-11-01','created_month=bad','kind=invalid'])await request('/appeals?'+query,{cookie:employee,status:400});
check(true,'invalid dates, reversed interval and unknown type produce validation errors');
const typed=await get('/appeals?kind=praise&q='+marker);
check(typed.items.length===1&&typed.items[0].id===praise&&typed.counts.total===1,'type filter returns praise with matching counters');
const final=await get('/analytics');
check(final.summary.closed===initial.summary.closed+2,'closed analytics includes confirmed solution and processed praise');
check(final.summary.first_response_count===initial.summary.first_response_count+1,'author comment does not add another first-response sample');
for(const cookie of [employee,executor,admin])await request('/logout',{cookie,method:'POST',status:204});
console.log(JSON.stringify({checks,status:'PASS',scope:'dataset scenarios and gaps',demo_appeal:appeal,refusal:rejected,praise,overdue},null,2));

import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
const base=process.env.BASE_URL||'http://localhost:5173';
let checks=0;
function ok(value,label){assert.ok(value,label);checks++;console.log('PASS',label)}
async function request(path,{method='GET',body,cookie,expected=200,origin}={}){const headers={};if(cookie)headers.Cookie=cookie;if(origin)headers.Origin=origin;if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';const r=await fetch(base+'/api'+path,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data=raw}assert.equal(r.status,expected,`${method} ${path}: ${raw}`);return {r,data}}
async function login(role){const {r}=await request('/login',{method:'POST',body:{email:role+'@dauys.local',password:'DauysDemo2026!'}});const cookie=r.headers.get('set-cookie');ok(cookie?.includes('HttpOnly')&&cookie.includes('SameSite=Lax'),'server session '+role);return cookie.split(';')[0]}
await request('/me',{expected:401});ok(true,'unauthenticated access denied');
await request('/login',{method:'POST',body:{email:'employee@dauys.local',password:'incorrect'},expected:401});
const employee=await login('employee'),executor=await login('executor'),admin=await login('admin');
const {data:meta}=await request('/meta',{cookie:employee});ok(meta.categories.length>=15,'dataset categories loaded');
const marker=Date.now();
const {data:created}=await request('/appeals',{method:'POST',cookie:employee,expected:201,body:{title:'Упростить передачу данных между системами',description:'Тестовое предложение для проверки полного цикла рассмотрения обращения. Тест '+marker,solution:'Проверить и подтвердить результат.',kind:'idea',category:meta.categories[0].name,department:'IT',priority:'high',affected:4,expected_effect:25000}});
const path='/appeals/'+created.id;
let {data:detail}=await request(path,{cookie:employee});ok(detail.appeal.assignee_id==='executor'&&detail.history.length===1,'category routing and history persisted');
await request(path,{method:'PATCH',cookie:employee,body:{...detail.appeal,status:'progress',title:'Меньше ручного ввода данных'}}); // author can edit text but cannot change processing state
({data:detail}=await request(path,{cookie:employee}));ok(detail.appeal.status==='new'&&detail.appeal.title==='Меньше ручного ввода данных','author text edit cannot escalate status');
await request('/admin/categories',{method:'PATCH',cookie:employee,body:{name:'Injected',assignee_id:'employee'},expected:403});ok(true,'administrator permissions enforced');
await request(path+'/vote',{method:'POST',cookie:employee});await request(path+'/vote',{method:'POST',cookie:employee});await request(path+'/vote',{method:'POST',cookie:employee});
({data:detail}=await request(path,{cookie:employee}));ok(detail.appeal.votes===1&&detail.appeal.voted,'one reversible vote per employee');
const form=new FormData();form.set('file',new File(['Synthetic attachment '+marker],'smoke.txt',{type:'text/plain'}));await request(path+'/files',{method:'POST',body:form,cookie:employee,expected:201});
({data:detail}=await request(path,{cookie:employee}));ok(detail.files.length===1,'file metadata persisted');const file=await request('/files/'+detail.files[0].id,{cookie:employee});ok(file.data.includes('Synthetic attachment'),'protected file download');await request('/files/'+detail.files[0].id,{expected:401});
await request(path,{method:'PATCH',cookie:executor,body:{...detail.appeal,status:'waiting'}});
await request(path+'/comments',{method:'POST',cookie:executor,body:{body:'Уточните детали для проверки результата.'},expected:201});await request(path+'/comments',{method:'POST',cookie:employee,body:{body:'Детали уточнены, тестовый файл приложен.'},expected:201});
({data:detail}=await request(path,{cookie:employee}));ok(detail.comments.length===2&&detail.appeal.status==='waiting','two-way clarification persisted');
const before=await request('/analytics',{cookie:employee});
await request(path,{method:'PATCH',cookie:executor,body:{...detail.appeal,status:'resolved',result:'Изменение внедрено и проверено в полном демонстрационном сценарии.',actual_effect:25000}});
const unconfirmed=await request('/analytics',{cookie:employee});ok(unconfirmed.data.summary.confirmed_effect===before.data.summary.confirmed_effect,'unconfirmed savings excluded from confirmed total');
await request(path,{method:'PATCH',cookie:executor,body:{...detail.appeal,status:'closed'},expected:400});
await request(path,{method:'PATCH',cookie:employee,body:{status:'closed'}});({data:detail}=await request(path,{cookie:employee}));ok(detail.appeal.confirmed&&detail.appeal.status==='closed','author alone confirms solution');
const after=await request('/analytics',{cookie:employee});ok(after.data.summary.confirmed_effect===before.data.summary.confirmed_effect+25000,'confirmed savings reflected in analytics');
const board=await request('/appeals?status=done',{cookie:employee});ok(board.data.items.some(a=>a.id===created.id)&&board.data.items.every(a=>a.kind!=='praise'),'results board filters completed improvements');
await request(path,{method:'PATCH',cookie:executor,body:{...detail.appeal,status:'progress'}});
const reopened=await request('/analytics',{cookie:employee});ok(reopened.data.summary.confirmed_effect===before.data.summary.confirmed_effect,'reopening removes previous confirmation');
await request(path,{method:'PATCH',cookie:executor,body:{...detail.appeal,status:'resolved'}});await request(path,{method:'PATCH',cookie:employee,body:{status:'closed'}});
const related=await request('/appeals/A-001',{cookie:executor});await request('/appeals/A-001',{method:'PATCH',cookie:executor,body:{...related.data.appeal,parent_id:created.id}});
const grouped=await request(path,{cookie:employee});ok(grouped.data.linked.some(a=>a.id==='A-001'),'duplicate appeals linked to a common theme');
await request('/appeals/A-001',{method:'PATCH',cookie:executor,body:related.data.appeal});
await request(path+'/vote',{method:'POST',cookie:employee,origin:'https://untrusted.invalid',expected:403});ok(true,'cross-origin write denied');
const {data:filtered}=await request('/appeals?q='+marker+'&department=IT',{cookie:employee});ok(filtered.total===1,'server search and department filtering');
const {data:notices}=await request('/notifications',{cookie:employee});ok(notices.some(n=>n.appeal_id===created.id&&!n.read_at),'persistent notifications');
const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),12000);const events=await fetch(base+'/api/events',{headers:{Cookie:employee},signal:ctrl.signal});ok(events.headers.get('content-type').includes('text/event-stream'),'SSE content type');const reader=events.body.getReader();const event=await reader.read();ok(new TextDecoder().decode(event.value).includes('event: update'),'SSE update delivered');ctrl.abort();clearTimeout(timer);
await request('/notifications/read',{method:'POST',cookie:employee,expected:204});
await request('/admin/categories',{method:'PATCH',cookie:admin,body:{name:'Тест маршрутизации '+marker,assignee_id:''}});ok(true,'admin can configure unassigned queue');
const samples=[];for(let i=0;i<30;i++){const start=performance.now();await request('/appeals?mine=true',{cookie:employee});samples.push(performance.now()-start)}samples.sort((a,b)=>a-b);console.log('List latency, 30 sequential requests: p95='+samples[Math.ceil(samples.length*.95)-1].toFixed(1)+'ms (not a load benchmark)');
await request('/logout',{method:'POST',cookie:employee,expected:204});await request('/me',{cookie:employee,expected:401});ok(true,'logout invalidates server session');
console.log(JSON.stringify({checks,appeal:created.id,status:'PASS'},null,2));

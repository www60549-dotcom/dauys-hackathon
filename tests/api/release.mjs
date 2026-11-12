import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync('data/release-test.json','utf8').replace(/^\uFEFF/,''));
assert.match(config.database,/^dauys_workflow_release_/);
assert.equal(process.env.DAUYS_ALLOW_TEST_WRITES,'1');
const base=process.env.BASE_URL||'http://127.0.0.1:8081';let checks=0;const cookies={};
const pass=label=>{checks++;console.log('PASS',label);};
const sql=text=>execFileSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-h','127.0.0.1','-p','55432','-U','dauys','-d',config.database,'-At','-v','ON_ERROR_STOP=1','-c',text],{encoding:'utf8'}).trim();
async function req(path,{as='employee',method='GET',body,status=200}={}){const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Cookie:cookies[as]||''},body:body===undefined?undefined:JSON.stringify(body)});const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data=raw}if(status!==null)assert.equal(r.status,status,`${method} ${path}: ${raw}`);return {r,data};}
for(const as of ['employee','executor','admin']){const {r}=await req('/login',{as,method:'POST',body:{email:as+'@dauys.local',password:'DauysDemo2026!'}});cookies[as]=r.headers.get('set-cookie').split(';')[0];}
const meta=(await req('/meta')).data;const category=meta.categories.find(c=>c.assignee_id==='executor').name;
async function create(){return (await req('/appeals',{method:'POST',status:201,body:{title:'Проверка SLA и событийной динамики',description:'Тестовое обращение на отдельной копии базы, для проверки сроков и эскалации.',kind:'problem',category,department:'IT',priority:'medium',affected:3,expected_effect:100000}})).data.id;}
const id=await create(),p='/appeals/'+id;
let sla=(await req(p+'/sla')).data;assert.equal(sla.can_remind,false);assert.equal(sla.first_response_at,null);pass('new appeal has a reply deadline, reminder is not available early');
sql(`UPDATE appeals SET response_due_at=now()-interval '1 hour' WHERE id='${id}'`);
sla=(await req(p+'/sla')).data;assert.ok(sla.response_overdue&&sla.can_remind);pass('overdue first response enables reminder');
const version=(await req(p)).data.appeal.version;
await req(p+'/remind',{method:'POST',body:{},status:428});pass('reminder requires viewed revision');
await req(p+'/remind',{method:'POST',body:{expected_version:version-1},status:409});pass('stale reminder is rejected');
const race=await Promise.all([1,2].map(()=>req(p+'/remind',{method:'POST',body:{expected_version:version},status:null})));assert.deepEqual(race.map(x=>x.r.status).sort(),[200,409]);pass('concurrent clicks create one escalation');
let detail=(await req(p)).data;assert.equal(detail.history.filter(h=>h.event_type==='appeal_escalated').length,1);pass('escalation records one structured history event');
for(const as of ['executor','admin']){assert.ok((await req('/notifications',{as})).data.some(n=>n.appeal_id===id&&n.body.includes('Эскалация')));}pass('executor and fallback administrators receive notification');
await req(p+'/remind',{method:'POST',body:{expected_version:detail.appeal.version},status:400});pass('24-hour cooldown is enforced by server');
await req(p+'/comments',{as:'executor',method:'POST',body:{body:'Проверяем подробности, укажите номер объекта.'},status:201});sla=(await req(p+'/sla')).data;assert.ok(sla.first_response_at);assert.equal(sla.response_overdue,false);pass('real executor reply stops the first-response timer');
await req(p,{as:'executor',method:'PATCH',body:{action:'manage',expected_version:detail.appeal.version,status:'waiting'}});
sql(`UPDATE appeals SET due_at=now()-interval '1 hour' WHERE id='${id}'`);
sla=(await req(p+'/sla')).data;assert.ok(sla.waiting_for_author);assert.equal(sla.can_remind,false);pass('waiting for author pauses escalation');
await req(p+'/comments',{method:'POST',body:{body:'Номер объекта 24. Прикладываем данные для проверки.'},status:201});
detail=(await req(p)).data;
await req(p,{as:'executor',method:'PATCH',body:{action:'manage',expected_version:detail.appeal.version,status:'progress'}});
// Create a historical cohort with a real resolution in the current month.
sql(`UPDATE appeals SET created_at='2025-01-10T12:00:00+05',due_at=now()+interval '1 day' WHERE id='${id}'`);
const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Qyzylorda',year:'numeric',month:'2-digit'}).format(new Date()).replace('/','-');
const localMonth=sql("SELECT to_char(now() AT TIME ZONE 'Asia/Qyzylorda','YYYY-MM')");
const before=(await req('/analytics?month='+localMonth+'&department=IT')).data;
detail=(await req(p)).data;
await req(p,{as:'executor',method:'PATCH',body:{action:'manage',expected_version:detail.appeal.version,status:'resolved',result:'Проверка завершена: общий каталог подготовлен и доступ проверен.',actual_effect:4500}});
let after=(await req('/analytics?month='+localMonth+'&department=IT')).data;
assert.equal(after.summary.total,before.summary.total);assert.equal(after.summary.resolved,before.summary.resolved+1);pass('resolution counts in event month even when appeal was created in another year');
assert.equal(after.trend.at(-1).resolved,before.trend.at(-1).resolved+1);assert.equal(after.trend.length,12);pass('monthly chart uses actual resolution events');
assert.equal(after.summary.confirmed_effect,before.summary.confirmed_effect);pass('unconfirmed solution is not confirmed savings');
detail=(await req(p)).data;await req(p,{method:'PATCH',body:{action:'confirm',expected_version:detail.appeal.version}});
after=(await req('/analytics?month='+localMonth+'&department=IT')).data;
assert.equal(after.summary.confirmed_effect,before.summary.confirmed_effect+4500);assert.equal(after.trend.at(-1).resolved,before.trend.at(-1).resolved+1);pass('author confirmation adds measured money without double counting resolution');
detail=(await req(p)).data;await req(p+'/reopen',{method:'POST',body:{reason:'На следующем объекте проблема повторилась, проверяем доступ.',expected_version:detail.appeal.version}});
after=(await req('/analytics?month='+localMonth+'&department=IT')).data;
assert.equal(after.summary.confirmed_effect,before.summary.confirmed_effect);assert.equal(after.trend.at(-1).resolved,before.trend.at(-1).resolved+1);pass('reopening removes current confirmed effect, preserves past event');
const stranger=sql(`INSERT INTO users(id,name,email,password_hash,role,department) SELECT 'release-other','Other employee','release-other@local',password_hash,'employee','IT' FROM users WHERE id='employee' ON CONFLICT DO NOTHING; SELECT id FROM users WHERE id='release-other'`);
const {r}=await req('/login',{as:'other',method:'POST',body:{email:'release-other@local',password:'DauysDemo2026!'}});cookies.other=r.headers.get('set-cookie').split(';')[0];
await req(p+'/remind',{as:'other',method:'POST',body:{expected_version:(await req(p)).data.appeal.version},status:403});pass('unrelated employee cannot escalate');
await req('/analytics?month=bad',{status:400});pass('invalid analytics period is rejected');
assert.equal((await fetch(base+'/deep/link')).status,200);assert.equal((await req('/missing-route',{status:404})).r.status,404);pass('single-port SPA works and unknown API is JSON 404');
const boundary=await create();sql(`UPDATE appeals SET created_at='2026-02-01T00:30:00+05' WHERE id='${boundary}'`);
const feb=(await req('/analytics?month=2026-02&department=IT')).data;
assert.equal(feb.trend.at(-1).month,'2026-02');assert.equal(feb.trend.at(-1).total,feb.summary.total);
assert.equal((await req('/appeals?created_month=2026-02&q='+boundary)).data.total,1);
assert.equal((await req('/appeals?created_month=2026-01&q='+boundary)).data.total,0);pass('month boundaries and drilldown use Kazakhstan time even before UTC midnight');
const controller=new AbortController();
try {
 const stream=await fetch(base+'/api/events',{headers:{Cookie:cookies.other},signal:controller.signal});
 const reader=stream.body.getReader();const initial=new TextDecoder().decode((await reader.read()).value);
 const initialRevision=JSON.parse(initial.split('data: ')[1].split('\n')[0]).revision;
 await create();let changed=false;
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{for(let i=0;i<6;i++){const chunk=new TextDecoder().decode((await reader.read()).value);if(chunk.includes('data: ') && JSON.parse(chunk.split('data: ')[1].split('\n')[0]).revision!==initialRevision){changed=true;break}}}finally{clearTimeout(timeout)}
 assert.ok(changed);pass('SSE refreshes an unrelated observer after a committed workspace change');
}finally{controller.abort()}
console.log(JSON.stringify({status:'PASS',checks,id,scope:'SLA, cooldown, concurrency, event analytics, confirmed effect'}));

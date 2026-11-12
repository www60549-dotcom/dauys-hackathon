import assert from 'node:assert/strict';
assert.equal(process.env.DAUYS_ALLOW_TEST_WRITES,'1','Use an isolated database and DAUYS_ALLOW_TEST_WRITES=1');
const base=process.env.BASE_URL || 'http://127.0.0.1:8081';
let checks=0;const cookies={},users={};
const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS',label);};
async function req(path,{as='employee',method='GET',body,expected=200}={}) {
  const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...(cookies[as]?{Cookie:cookies[as]}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}
  if(expected!==null)assert.equal(response.status,expected,`${method} ${path}: ${raw}`);
  return {response,data};
}
for(const role of ['employee','executor','admin']) {
  const {response}=await req('/login',{method:'POST',body:{email:role+'@dauys.local',password:process.env.DAUYS_TEST_PASSWORD||'DauysDemo2026!'}});
  cookies[role]=response.headers.get('set-cookie').split(';')[0];users[role]=(await req('/me',{as:role})).data;
}
const meta=(await req('/meta')).data,category=meta.categories.find(value=>value.assignee_id===users.executor.id).name;
const create=async(kind='problem',as='employee')=>(await req('/appeals',{as,method:'POST',expected:201,body:{title:'В общих папках разные версии монтажных инструкций',description:'Сотрудники ищут актуальную редакцию документа среди старых памяток. Требуется единый каталог с финальными версиями.',kind,category,department:'Проектирование',priority:'medium',affected:12,expected_effect:0}})).data.id;
const id=await create(),path='/appeals/'+id;
const features=async(as='employee')=>(await req(path+'/features',{as})).data;
let snapshot=await features();
check(snapshot.appeal_version===1 && snapshot.permissions.can_assess && !snapshot.permissions.can_pilot && snapshot.impact===null,'feature snapshot returns a revision and employee permissions');
check((await features('executor')).permissions.can_pilot,'assigned executor can manage a pilot');
const estimate={people:12,minutes:10,occurrences_month:20,hourly_rate:1500};
await req(path+'/impact',{method:'PATCH',body:estimate,expected:428});
check((await features()).impact===null,'unversioned estimate cannot be saved');
const before=(await req('/analytics')).data.summary.confirmed_effect;
await req(path+'/impact',{method:'PATCH',body:{...estimate,expected_appeal_version:1}});
snapshot=await features();
check(snapshot.appeal_version===2 && snapshot.impact.hours_month===40 && snapshot.impact.cost_month===60000,'monthly estimate persists with the same committed revision');
check((await req('/analytics')).data.summary.confirmed_effect===before,'estimated waiting cost never becomes confirmed savings');
const race=await Promise.all([
  req(path+'/impact',{as:'executor',method:'PATCH',expected:null,body:{...estimate,minutes:5,expected_appeal_version:2}}),
  req(path+'/impact',{as:'admin',method:'PATCH',expected:null,body:{...estimate,minutes:15,expected_appeal_version:2}}),
]);
check(race.map(value=>value.response.status).sort().join(',')==='200,409','two estimates with the same revision produce one winner');
snapshot=await features();
check(snapshot.appeal_version===3 && snapshot.impact.minutes===(race[0].response.status===200?5:15),'losing estimate cannot overwrite the saved numbers');
await req(path+'/impact',{method:'PATCH',body:{...estimate,hourly_rate:0,expected_appeal_version:snapshot.appeal_version}});
snapshot=await features();
check(snapshot.impact.hours_month===40 && snapshot.impact.cost_month===0,'zero hourly rate records time without invented financial value');
const plan={action:'create',hypothesis:'Единый каталог сократит время поиска финальной инструкции',scope:'Контрольная монтажная бригада',metric:'Время поиска',unit:'мин',baseline:12,target:4,direction:'decrease',owner_id:users.executor.id,end_at:'2027-01-15'};
await req(path+'/pilots',{method:'POST',body:{...plan,expected_appeal_version:snapshot.appeal_version},expected:403});
await req(path+'/pilots',{as:'executor',method:'POST',body:plan,expected:428});
check((await features()).pilots.length===0,'pilot creation checks role and viewed revision');
await req(path+'/pilots',{as:'executor',method:'POST',body:{...plan,expected_appeal_version:snapshot.appeal_version}});
let latest=await features('executor'),pilot=latest.pilots[0];
check(pilot.state==='planned' && latest.appeal_version===snapshot.appeal_version+1,'planning a pilot advances the whole appeal revision');
await req(path+'/impact',{method:'PATCH',body:{...estimate,expected_appeal_version:snapshot.appeal_version},expected:409});
check(true,'a stale estimate cannot bypass a newer pilot plan');
await req(path+'/pilots',{as:'executor',method:'POST',body:{...plan,action:'save',id:pilot.id,version:pilot.version,scope:'Уточнённая контрольная бригада',expected_appeal_version:latest.appeal_version}});
latest=await features('executor');const saved=latest.pilots[0];
check(saved.version===pilot.version+1 && saved.scope==='Уточнённая контрольная бригада','planned pilot edits persist with their own revision');
await req(path+'/pilots',{as:'executor',method:'POST',body:{action:'start',id:pilot.id,version:pilot.version,expected_appeal_version:latest.appeal_version},expected:409});
check((await features()).pilots[0].state==='planned','stale pilot version cannot start a changed plan');
await req(path+'/pilots',{as:'executor',method:'POST',body:{action:'start',id:saved.id,version:saved.version,expected_appeal_version:latest.appeal_version}});
latest=await features('executor');pilot=latest.pilots[0];
let detail=(await req(path)).data;
check(pilot.state==='running' && detail.appeal.status==='progress' && latest.appeal_version===detail.appeal.version,'pilot start updates status and feature snapshot together');
await req(path,{as:'executor',method:'PATCH',body:{action:'manage',expected_version:detail.appeal.version,status:'resolved',result:'Попытка закрыть обращение до подведения итогов пилота.'},expected:400});
check((await req(path)).data.appeal.status==='progress','active pilot blocks premature resolution');
await req(path+'/pilots',{as:'executor',method:'POST',body:{...plan,action:'save',id:pilot.id,version:pilot.version,expected_appeal_version:latest.appeal_version},expected:400});
await req(path+'/pilots',{as:'executor',method:'POST',body:{action:'finish',id:pilot.id,version:pilot.version,actual:null,conclusion:'Результат ещё не измерен.',expected_appeal_version:latest.appeal_version},expected:400});
check((await features()).appeal_version===latest.appeal_version,'running baseline is immutable and missing measurements create no changes');
await req(path+'/pilots',{as:'executor',method:'POST',body:{action:'finish',id:pilot.id,version:pilot.version,actual:4,conclusion:'По контрольному замеру поиск занимает четыре минуты вместо двенадцати.',expected_appeal_version:latest.appeal_version}});
latest=await features();pilot=latest.pilots[0];
check(pilot.state==='evaluated' && pilot.actual===4 && pilot.goal_met===true,'measured result and goal outcome are persisted');
detail=(await req(path)).data;
check(!detail.appeal.confirmed && (await req('/analytics')).data.summary.confirmed_effect===before,'successful pilot alone does not fabricate confirmed financial effect');
const second={...plan,metric:'Готовые операции',unit:'шт',direction:'increase',baseline:20,target:40,expected_appeal_version:latest.appeal_version};
await req(path+'/pilots',{as:'executor',method:'POST',body:second});latest=await features();pilot=latest.pilots[0];
await req(path+'/pilots',{as:'executor',method:'POST',body:{action:'start',id:pilot.id,version:pilot.version,expected_appeal_version:latest.appeal_version}});latest=await features();pilot=latest.pilots[0];
await req(path+'/pilots',{as:'executor',method:'POST',body:{action:'finish',id:pilot.id,version:pilot.version,actual:35,conclusion:'Рост есть, но выбранная цель в сорок операций пока не достигнута.',expected_appeal_version:latest.appeal_version}});latest=await features();
check(latest.pilots[0].goal_met===false && latest.pilots.length===2,'increasing metrics can miss the goal and previous pilot outcomes remain visible');
const positive=await create('praise');let positiveDetail=(await req('/appeals/'+positive)).data;
const praiseFeatures=(await req('/appeals/'+positive+'/features',{as:'admin'})).data;
check(!praiseFeatures.permissions.can_assess && !praiseFeatures.permissions.can_pilot,'praise is not presented as waiting loss or an experiment');
await req('/appeals/'+positive+'/impact',{as:'admin',method:'PATCH',expected:409,body:{...estimate,expected_appeal_version:positiveDetail.appeal.version}});
await req('/appeals/'+positive+'/pilots',{as:'admin',method:'POST',expected:409,body:{...plan,expected_appeal_version:positiveDetail.appeal.version}});
check(true,'server enforces praise restrictions independently of the interface');
const other=await create('problem','admin');const otherSnapshot=(await req('/appeals/'+other+'/features')).data;
await req('/appeals/'+other+'/impact',{method:'PATCH',expected:403,body:{...estimate,expected_appeal_version:otherSnapshot.appeal_version}});
check(!otherSnapshot.permissions.can_assess,'employee cannot change another author estimate');
const text='Где найти актуальную редакцию инструкции среди старых памяток';
const matches=(await req('/appeals/similar?text='+encodeURIComponent(text))).data;
check(matches.method==='local_concepts' && matches.items.some(value=>value.id===id) && matches.items.every(value=>Array.isArray(value.reasons)),'similarity returns actual stored appeals with explainable reasons');
const excluded=(await req('/appeals/similar?text='+encodeURIComponent(text)+'&exclude='+id)).data;
check(excluded.items.every(value=>value.id!==id),'current appeal is excluded from related suggestions');
check((await req('/appeals/similar?text='+encodeURIComponent('Заказать пиццу сегодня'))).data.items.length===0,'unrelated text does not produce fabricated matches');
const consistent=await create();const consistentPath='/appeals/'+consistent;
await req(consistentPath+'/impact',{method:'PATCH',body:{people:2,minutes:1,occurrences_month:1,hourly_rate:0,expected_appeal_version:1}});
const observations=[];
const reader=(async()=>{for(let i=0;i<18;i++)observations.push((await req(consistentPath+'/features')).data);})();
for(let i=0;i<8;i++){
 const state=(await req(consistentPath+'/features')).data;
 await req(consistentPath+'/impact',{method:'PATCH',body:{people:state.appeal_version+1,minutes:1,occurrences_month:1,hourly_rate:0,expected_appeal_version:state.appeal_version}});
}
await reader;
check(observations.every(value=>value.impact.people===value.appeal_version),'feature reads never mix a revision with another transaction numbers');
console.log(JSON.stringify({status:'PASS',checks,appeal:id,scope:'persistent estimates, complete pilots, version conflicts, real similar appeals'}));

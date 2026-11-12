import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const compile=source=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const draftURL=compile(await readFile(new URL('../src/lib/appealDraft.ts',import.meta.url),'utf8'));
const source=(await readFile(new URL('../src/lib/businessDraft.ts',import.meta.url),'utf8')).replace("from './appealDraft'",`from '${draftURL}'`);
const {createBusinessDraft,reconcileBusinessDraft,estimateWaiting,impactInput,pilotCommand,similarSearchText}=await import(compile(source));
const user={id:'executor',role:'executor'},item={id:'A-1',affected:12,assignee_id:'executor',version:4};
const snapshot={appeal_version:4,impact:null,pilots:[],recurrences:[],permissions:{can_assess:true,can_pilot:true}};
test('waiting cost uses a monthly frequency and never invents the hourly rate',()=>{
  const result=estimateWaiting({people:'12',minutes:'10',occurrences:'20',rate:'0'});
  assert.deepEqual(result,{hours:40,money:0});
  assert.deepEqual(estimateWaiting({people:'12',minutes:'10',occurrences:'20',rate:'1500'}),{hours:40,money:60000});
  assert.equal(estimateWaiting({people:'',minutes:'10',occurrences:'20',rate:'1500'}),null);
  assert.throws(()=>impactInput({people:'1.5',minutes:'10',occurrences:'20',rate:'0'}),/целым/);
});
test('dirty business forms retain both input and the originally viewed revision on SSE',()=>{
  const original=createBusinessDraft(item,snapshot,user);
  const edited={...original,dirty:true,mode:'impact',impact:{people:'12',minutes:'15',occurrences:'30',rate:'0'}};
  const newer={...snapshot,appeal_version:5,impact:{people:9,minutes:5,occurrences_month:20,hourly_rate:3000}};
  assert.equal(reconcileBusinessDraft(edited,{...item,version:5},newer,user),edited);
  assert.equal(edited.baseVersion,4);
  assert.equal(reconcileBusinessDraft(original,{...item,version:5},newer,user).baseVersion,5);
  assert.equal(reconcileBusinessDraft(edited,{...item,id:'A-2'},newer,user).dirty,false);
});
const plan={id:7,version:2,state:'planned',hypothesis:'Проверим единый каталог инструкций',scope:'Монтажная бригада',metric:'Время поиска',unit:'мин',baseline:12,target:4,direction:'decrease',owner_id:'executor',end_at:'2026-12-01',actual:null,conclusion:''};
test('pilot commands retain both revisions and do not send unfinished plan fields on start',()=>{
  const draft=createBusinessDraft(item,{...snapshot,pilots:[plan]},user);
  const start=pilotCommand(draft,'start');
  assert.deepEqual(start,{action:'start',id:7,version:2,expected_appeal_version:4});
  const save=pilotCommand(draft,'save');assert.equal(save.baseline,12);assert.equal(save.target,4);
});
test('pilot finish requires measurement, accepts zero and preserves a draft after remote evaluation',()=>{
  const draft=createBusinessDraft(item,{...snapshot,pilots:[{...plan,state:'running'}]},user);
  draft.pilot.conclusion='По итогам контрольного замера ожидание отсутствует.';
  assert.throws(()=>pilotCommand(draft,'finish'),/Фактическая/);
  draft.pilot.actual='0';draft.dirty=true;draft.mode='pilot';
  assert.equal(pilotCommand(draft,'finish').actual,0);
  const latest={...snapshot,appeal_version:5,pilots:[{...plan,state:'evaluated',actual:4}]};
  const retained=reconcileBusinessDraft(draft,{...item,version:5},latest,user);
  assert.equal(retained.pilot.state,'running');assert.equal(retained.pilot.actual,'0');assert.equal(retained.baseVersion,4);
});
test('a new plan cannot worsen its target and omits persisted identifiers',()=>{
  const draft=createBusinessDraft(item,snapshot,user);
  draft.pilot={...draft.pilot,hypothesis:plan.hypothesis,scope:plan.scope,metric:plan.metric,unit:plan.unit,baseline:'12',target:'15'};
  assert.throws(()=>pilotCommand(draft,'create'),/улучшать/);
  draft.pilot.target='4';const command=pilotCommand(draft,'create');
  assert.equal('id' in command,false);assert.equal(command.expected_appeal_version,4);
});
test('similarity search normalizes whitespace and bounds Unicode without splitting characters',()=>{
  assert.equal(similarSearchText('  Старые  инструкции ',' в  разных папках '),'Старые инструкции в разных папках');
  const text=similarSearchText('😀'.repeat(400),'доступ');assert.equal(Array.from(text).length,240);
  assert.ok(encodeURIComponent(text).length<3000);
});

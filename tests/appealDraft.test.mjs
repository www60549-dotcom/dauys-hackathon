import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/appealDraft.ts', import.meta.url),'utf8');
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {createAppealDraft,reconcileAppealDraft,isStaleDraft,toEditInput,toManageInput,dateForInput} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const snapshot = {id:'A-1',version:1,status:'waiting',priority:'medium',assignee_id:'executor',parent_id:'',result:'',actual_effect:0,due_at:'2026-11-12T18:00:00+05:00',title:'Исходный заголовок',description:'Исходное подробное описание',solution:''};
test('SSE refresh preserves unsaved text and the original precondition',()=>{
  const draft={...createAppealDraft(snapshot),description:'Мои несохранённые правки',dirty:true};
  const newer={...snapshot,version:2,description:'Другой сотрудник изменил описание'};
  const result=reconcileAppealDraft(draft,newer);
  assert.equal(result,draft); assert.equal(result.description,'Мои несохранённые правки'); assert.equal(result.expected_version,1); assert.equal(isStaleDraft(result,newer),true);
});
test('clean forms track new versions, and a different ticket never inherits previous edits',()=>{
  assert.equal(reconcileAppealDraft(createAppealDraft(snapshot),{...snapshot,version:3}).expected_version,3);
  const changed={...createAppealDraft(snapshot),description:'Чужой черновик',dirty:true};
  const result=reconcileAppealDraft(changed,{...snapshot,id:'A-2',version:7});
  assert.equal(result.id,'A-2'); assert.equal(result.dirty,false); assert.equal(result.description,snapshot.description);
  assert.equal(reconcileAppealDraft(changed,undefined),null);
});
test('command payloads keep the viewed revision and whitelist fields per action',()=>{
  const draft={...createAppealDraft(snapshot),title:'  Уточнённый заголовок  ',description:'  Уточнённое описание  ',dirty:true};
  const content=toEditInput(draft), management=toManageInput(draft);
  assert.equal(content.expected_version,1); assert.equal(content.title,'Уточнённый заголовок'); assert.equal(content.description,'Уточнённое описание');
  assert.equal('assignee_id' in content,false); assert.equal('dirty' in management,false); assert.equal('description' in management,false); assert.equal(management.expected_version,1);
});
test('only explicit reload discards a dirty form and adopts a newer precondition',()=>{
  const latest={...snapshot,version:5,title:'Актуальное решение'};
  const draft=createAppealDraft(latest);
  assert.equal(draft.expected_version,5); assert.equal(draft.title,latest.title); assert.equal(draft.dirty,false); assert.equal(isStaleDraft(draft,latest),false);
});
test('date input respects Qyzylorda midnight independently of browser timezone',()=>{
  assert.equal(dateForInput('2026-11-11T23:30:00Z'),'2026-11-12');
  assert.equal(dateForInput('2026-11-12T00:30:00+05:00'),'2026-11-12');
});
test('reopening reason survives a conflicting update and is not sent by unrelated commands',()=>{
  const draft={...createAppealDraft({...snapshot,status:'closed'}),reopen_reason:'Проблема повторилась на новом объекте.',dirty:true};
  const result=reconcileAppealDraft(draft,{...snapshot,status:'closed',version:2});
  assert.equal(result.reopen_reason,draft.reopen_reason); assert.equal(result.expected_version,1);
  assert.equal('reopen_reason' in toManageInput(result),false); assert.equal('reopen_reason' in toEditInput(result),false);
});

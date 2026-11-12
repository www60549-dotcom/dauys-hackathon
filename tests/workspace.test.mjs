import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

async function loadSource(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}});
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {employeeAppeals, activeEmployeeAppeals, repeatedProblemGroups, DEMO_EMPLOYEE} = await loadSource('../src/lib/workspace.ts');
const {publicImprovements} = await loadSource('../src/data/publicImprovements.ts');
const {DEMO_AUTHOR} = await loadSource('../src/lib/innovation.ts');
const make = (id, changes = {}) => ({id, author: DEMO_EMPLOYEE.name, createdAt: 1, updatedAt: 2, status: 'new', kind: 'problem', category: 'Обучение', supporterIds: [], ...changes});

test('personal views contain only the current employee and use update order without mutating the repository', () => {
  const items = [make('mine-old'), make('other-new', {author: 'Другой сотрудник', updatedAt: 99}), make('mine-new', {updatedAt: 10})];
  assert.deepEqual(employeeAppeals(items, DEMO_EMPLOYEE.name).map(item => item.id), ['mine-new', 'mine-old']);
  assert.deepEqual(items.map(item => item.id), ['mine-old', 'other-new', 'mine-new']);
  assert.equal(DEMO_EMPLOYEE.name, DEMO_AUTHOR);
});

test('personal active count includes solutions awaiting author confirmation, excluding closed/rejected and other authors', () => {
  const items = [make('pending', {status: 'resolved'}), make('waiting', {status: 'waiting'}), make('new'), make('closed', {status: 'closed'}), make('rejected', {status: 'rejected'}), make('other', {author: 'Другой сотрудник'})];
  assert.deepEqual(activeEmployeeAppeals(items, DEMO_EMPLOYEE.name).map(item => item.id).sort(), ['new', 'pending', 'waiting']);
  assert.equal(activeEmployeeAppeals(items.map(item => item.id === 'pending' ? {...item, status: 'closed'} : item), DEMO_EMPLOYEE.name).length, 2);
});

test('public board is an explicit safe summary catalog, without internal IDs, people, comments or financial estimates', () => {
  assert.ok(publicImprovements.length > 0);
  for (const item of publicImprovements) {
    assert.deepEqual(Object.keys(item).sort(), ['outcome', 'slug', 'summary', 'title']);
    assert.ok(item.title && item.summary && item.outcome);
    assert.doesNotMatch(JSON.stringify(item), /A-\d{3}|@dauys|supporterIds|assignee|comments|hourlyRate|DEMO_AUTHOR/);
  }
});

test('repeated-problem groups count actual records and unique supports, never suggestions or fabricated repeats', () => {
  const items = [make('a', {supporterIds: ['user-1']}), make('b', {supporterIds: ['user-1', 'user-2']}), make('idea', {kind: 'idea'}), make('single', {category: 'IT'}), make('supported', {category: 'Закупки', supporterIds: ['user-3']})];
  const groups = repeatedProblemGroups(items);
  assert.deepEqual(groups.map(group => [group.category, group.items.length, group.supporters]), [['Обучение', 2, 2], ['Закупки', 1, 1]]);
  assert.equal(repeatedProblemGroups([make('single')]).length, 0);
  assert.equal(repeatedProblemGroups([make('praise', {kind: 'praise', supporterIds: ['user-4']})]).length, 0);
});

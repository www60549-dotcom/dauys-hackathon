import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const clientURL = compile(await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../src/realtime/connection.ts', import.meta.url), 'utf8')).replace("from '../api/client'", `from '${clientURL}'`);
const {subscribe} = await import(compile(source));
class FakeSource extends EventTarget {
  static instances = [];
  closed = false;
  constructor(url) {super(); this.url = url; FakeSource.instances.push(this);}
  close() {this.closed = true;}
  update(revision) {this.dispatchEvent(new MessageEvent('update', {data: JSON.stringify({revision})}));}
}
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

test('SSE reuses the connection across StrictMode cleanup/setup and releases it on unmount', async () => {
  const original = globalThis.EventSource; globalThis.EventSource = FakeSource;
  try {
    let calls = 0;
    const first = subscribe('employee', () => calls++); first();
    const second = subscribe('employee', () => calls++);
    assert.equal(FakeSource.instances.length, 1);
    const source = FakeSource.instances[0];
    source.update('1:1'); source.update('1:1'); assert.equal(calls, 1);
    source.dispatchEvent(new Event('open')); source.update('1:1'); assert.equal(calls, 2, 'reconnect triggers state reconciliation even with same revision');
    source.dispatchEvent(new MessageEvent('update', {data: 'invalid'})); assert.equal(calls, 2);
    second(); await tick(); assert.equal(source.closed, true);
  } finally {globalThis.EventSource = original;}
});
test('SSE closes a previous account connection when identity changes', async () => {
  const original = globalThis.EventSource; globalThis.EventSource = FakeSource;
  try {
    const first = subscribe('employee', () => {}), old = FakeSource.instances.at(-1);
    const second = subscribe('admin', () => {}), current = FakeSource.instances.at(-1);
    assert.equal(old.closed, true); assert.notEqual(old, current); assert.equal(current.url, '/api/events');
    first(); second(); await tick(); assert.equal(current.closed, true);
  } finally {globalThis.EventSource = original;}
});

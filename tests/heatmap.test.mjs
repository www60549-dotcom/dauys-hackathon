import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/heatmap.ts', import.meta.url), 'utf8');
const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}});
const {heatmapTones, summarizeHeatmap} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(part => parseInt(part, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

test('every opaque heatmap foreground/background pair exceeds 7:1', () => {
  for (const [name, tone] of Object.entries(heatmapTones)) {
    const values = [luminance(tone.color), luminance(tone.background)].sort((a, b) => b - a);
    const contrast = (values[0] + 0.05) / (values[1] + 0.05);
    assert.ok(contrast >= 7, `${name}: ${contrast.toFixed(2)}:1`);
  }
});
test('tooltip summary preserves the actual count, distinct categories and maximum priority', () => {
  const items = [{category: 'Каталог и данные', priority: 'medium'}, {category: 'Каталог и данные', priority: 'low'}, {category: 'Проектная деятельность', priority: 'high'}];
  const summary = summarizeHeatmap(items);
  assert.equal(summary.count, 3);
  assert.equal(summary.priority, 'high');
  assert.equal(summary.label, 'Высокий');
  assert.deepEqual(summary.categories, ['Каталог и данные', 'Проектная деятельность']);
  assert.equal(summarizeHeatmap([]).count, 0);
  assert.equal(summarizeHeatmap([]).priority, 'none');
  assert.equal(summarizeHeatmap([{category: 'Другое', priority: 'unknown'}]).label, 'Не указан');
});

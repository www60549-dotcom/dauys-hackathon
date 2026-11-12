import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/particlePhysics.ts', import.meta.url), 'utf8');
const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}});
const {createSwarm, stepSwarm} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const swarm = createSwarm(), input = {x: 0, y: 0, active: true};
const samples = [];
for (let frame = 0; frame < 840; frame++) {
  input.x = Math.sin(frame * 0.025) * 0.8;
  input.y = Math.cos(frame * 0.037) * 0.7;
  const before = performance.now();
  stepSwarm(swarm, input, 1 / 60);
  const elapsed = performance.now() - before;
  if (frame >= 240) samples.push(elapsed);
}
samples.sort((a, b) => a - b);
console.log(JSON.stringify({
  environment: {node: process.version, platform: process.platform, cpu: cpus()[0]?.model},
  particles: swarm.count, warmupFrames: 240, measuredFrames: samples.length,
  cpuStepMs: {mean: +(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3), p95: +samples[Math.floor(samples.length * 0.95)].toFixed(3), max: +samples.at(-1).toFixed(3)},
  note: 'CPU physics only. Does not measure GPU, WebGL, UI, display refresh rate, INP or browser FPS.',
}, null, 2));

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/particlePhysics.ts', import.meta.url), 'utf8');
const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}});
const {createSwarm, resizeSwarm, stepSwarm, PARTICLE_COUNT, PARTICLE_CAMERA_Z} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const input = {x: 0.15, y: -0.1, active: true};
const idle = {x: 0, y: 0, active: false};

function assertCoverage(swarm) {
  const cells = new Uint8Array(swarm.count);
  for (let i = 0; i < swarm.count; i++) {
    const k = i * 3, depth = (PARTICLE_CAMERA_Z - swarm.positions[k + 2]) / PARTICLE_CAMERA_Z;
    const u = swarm.positions[k] / (swarm.width * depth) + 0.5;
    const v = swarm.positions[k + 1] / (swarm.height * depth) + 0.5;
    assert.ok(u > 0 && u < 1 && v > 0 && v < 1, `offscreen particle ${i}: ${u},${v}`);
    const cell = Math.floor(v * swarm.rows) * swarm.columns + Math.floor(u * swarm.columns);
    cells[cell]++;
  }
  assert.ok(cells.every(count => count === 1), 'screen-space cells must stay filled, one particle per cell');
}

test('2400 seeded anchors fill the viewport with varied size and depth', () => {
  const a = createSwarm(), b = createSwarm();
  assert.equal(PARTICLE_COUNT, 2400);
  assert.equal(a.positions.length, 7200);
  assert.deepEqual(a.positions, b.positions);
  assert.ok(Math.max(...a.sizes) - Math.min(...a.sizes) > 1);
  assertCoverage(a);
  assert.throws(() => createSwarm(0));
  assert.throws(() => createSwarm(2400, 41, NaN, 10));
});
test('desktop, portrait and wide fields stay evenly filled during cursor sweeps', () => {
  for (const [width, height] of [[18, 12], [4, 10], [28, 9]]) {
    const swarm = createSwarm(2400, 41, width, height);
    for (let frame = 0; frame < 600; frame++) {
      stepSwarm(swarm, {x: Math.sin(frame * 0.07) * 0.98, y: Math.cos(frame * 0.047) * 0.98, active: frame > 90 && frame < 500}, 1 / 60);
      if (frame % 60 === 0) assertCoverage(swarm);
    }
    assertCoverage(swarm);
  }
});
test('ambient motion floats across the field without replacing buffers', () => {
  const swarm = createSwarm(), before = swarm.positions.slice();
  const positions = swarm.positions, velocities = swarm.velocities, influences = swarm.influences;
  for (let frame = 0; frame < 240; frame++) stepSwarm(swarm, idle, 1 / 60);
  let moved = 0;
  for (let i = 0; i < swarm.count; i++) if (Math.hypot(positions[i * 3] - before[i * 3], positions[i * 3 + 1] - before[i * 3 + 1]) > 0.001) moved++;
  assert.ok(moved > swarm.count * 0.95);
  assert.equal(swarm.positions, positions); assert.equal(swarm.velocities, velocities); assert.equal(swarm.influences, influences);
  assertCoverage(swarm);
});
test('soft magnet stays bounded and cannot form a dense cursor clump', () => {
  const swarm = createSwarm(), ambient = createSwarm();
  for (let frame = 0; frame < 600; frame++) {
    stepSwarm(swarm, {x: 0, y: 0, active: true}, 1 / 60);
    stepSwarm(ambient, idle, 1 / 60);
  }
  const nearCursor = state => {
    let count = 0;
    for (let i = 0; i < state.count; i++) {
      const k = i * 3, depth = (PARTICLE_CAMERA_Z - state.positions[k + 2]) / PARTICLE_CAMERA_Z;
      if (Math.hypot(state.positions[k] / (state.width * depth) * 2, state.positions[k + 1] / (state.height * depth) * 2) < 0.07) count++;
    }
    return count;
  };
  assert.ok(nearCursor(swarm) <= nearCursor(ambient) * 1.5 + 3);
  let deflected = false;
  for (let i = 0; i < swarm.count; i++) {
    const k = i * 3, depth = (PARTICLE_CAMERA_Z - swarm.homes[k + 2]) / PARTICLE_CAMERA_Z;
    const dx = Math.abs(swarm.positions[k] - ambient.positions[k]) / (swarm.width / swarm.columns * depth);
    const dy = Math.abs(swarm.positions[k + 1] - ambient.positions[k + 1]) / (swarm.height / swarm.rows * depth);
    assert.ok(dx < 0.175 && dy < 0.175);
    if (dx > 0.01 || dy > 0.01) deflected = true;
  }
  assert.ok(deflected, 'the soft field must still react');
  assertCoverage(swarm);
});
test('friction settles cursor inertia and returns particles to their ambient orbits', () => {
  const swarm = createSwarm(512), ambient = createSwarm(512);
  for (let frame = 0; frame < 180; frame++) {
    stepSwarm(swarm, {x: Math.sin(frame * 0.035) * 0.8, y: 0, active: true}, 1 / 60);
    stepSwarm(ambient, idle, 1 / 60);
  }
  assert.ok(swarm.speed > 0.1);
  for (let frame = 0; frame < 180; frame++) { stepSwarm(swarm, input, 1 / 60); stepSwarm(ambient, idle, 1 / 60); }
  assert.ok(swarm.speed < 0.01);
  assert.ok(swarm.strength > 0.99);
  for (let frame = 0; frame < 1200; frame++) { stepSwarm(swarm, idle, 1 / 60); stepSwarm(ambient, idle, 1 / 60); }
  assert.ok(swarm.strength < 0.001);
  assert.ok(Math.max(...swarm.positions.map((value, i) => Math.abs(value - ambient.positions[i]))) < 0.0001);
});
test('fixed substeps keep 30/60/120 Hz trajectories close', () => {
  const run = fps => {
    const swarm = createSwarm(512);
    for (let i = 0; i < fps * 6; i++) stepSwarm(swarm, input, 1 / fps);
    return swarm;
  };
  const baseline = run(60);
  for (const fps of [30, 120]) {
    const alternative = run(fps);
    const meanError = baseline.positions.reduce((sum, value, i) => sum + Math.abs(value - alternative.positions[i]), 0) / baseline.positions.length;
    assert.ok(meanError < 0.01, `${fps} Hz: mean error ${meanError}`);
  }
});
test('invalid samples and long resume gaps cannot explode the field', () => {
  const swarm = createSwarm();
  for (let frame = 0; frame < 240; frame++) stepSwarm(swarm, {x: frame % 2 ? 1 : -1, y: frame % 2 ? -1 : 1, active: true}, 1 / 60);
  stepSwarm(swarm, {x: NaN, y: Infinity, active: true}, 1 / 60);
  const before = swarm.time;
  stepSwarm(swarm, input, 20);
  assert.ok(swarm.time - before <= 0.050001);
  stepSwarm(swarm, input, Infinity); stepSwarm(swarm, input, -1);
  assert.ok(swarm.positions.every(Number.isFinite)); assert.ok(swarm.velocities.every(Number.isFinite));
  assertCoverage(swarm);
});
test('resize preserves screen distribution, normalized position and depth', () => {
  const swarm = createSwarm(2400, 41, 18, 12), positions = swarm.positions;
  stepSwarm(swarm, input, 1 / 60);
  const x = positions[0], y = positions[1], z = positions[2];
  resizeSwarm(swarm, 4, 10);
  assert.equal(swarm.positions, positions);
  assert.ok(Math.abs(positions[0] - x * 4 / 18) < 0.00001);
  assert.ok(Math.abs(positions[1] - y * 10 / 12) < 0.00001);
  assert.equal(positions[2], z);
  assertCoverage(swarm);
  resizeSwarm(swarm, 0, NaN); assert.equal(swarm.width, 4);
});
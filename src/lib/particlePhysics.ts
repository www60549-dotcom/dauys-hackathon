export const PARTICLE_COUNT = 2400;
export const PARTICLE_CAMERA_Z = 10;
const MAX_FRAME_DELTA = 0.05;

export interface SwarmInput {x: number; y: number; active: boolean}
export interface ParticleSwarm {
  count: number;
  columns: number; rows: number;
  positions: Float32Array;
  velocities: Float32Array;
  homes: Float32Array;
  sizes: Float32Array;
  phases: Float32Array;
  sinPhases: Float32Array;
  cosPhases: Float32Array;
  influences: Float32Array;
  width: number; height: number; time: number;
  cursorX: number; cursorY: number;
  previousX: number; previousY: number;
  velocityX: number; velocityY: number;
  strength: number; speed: number; active: boolean;
}

function seededRandom(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Choose a complete grid: one softly jittered anchor per screen-space cell. */
function fieldGrid(count: number, aspect: number) {
  let columns = 1, score = Infinity;
  for (let candidate = 1; candidate <= count; candidate++) {
    if (count % candidate) continue;
    const error = Math.abs(Math.log((candidate / (count / candidate)) / aspect));
    if (error < score) { score = error; columns = candidate; }
  }
  return {columns, rows: count / columns};
}

/** Allocate once. Depth compensation keeps all anchors distributed in the viewport. */
export function createSwarm(count = PARTICLE_COUNT, seed = 41, width = 18, height = 12): ParticleSwarm {
  if (!Number.isInteger(count) || count < 1 || count > 10000 || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Invalid particle field dimensions.');
  const random = seededRandom(seed), {columns, rows} = fieldGrid(count, width / height);
  const positions = new Float32Array(count * 3), homes = new Float32Array(count * 3);
  const sizes = new Float32Array(count), phases = new Float32Array(count);
  const sinPhases = new Float32Array(count), cosPhases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const k = i * 3, column = i % columns, row = Math.floor(i / columns);
    const z = (random() - 0.5) * 5.6, depth = (PARTICLE_CAMERA_Z - z) / PARTICLE_CAMERA_Z;
    // Jitter stays inside the middle 40% of each cell, leaving room for motion.
    homes[k] = positions[k] = ((column + 0.3 + random() * 0.4) / columns - 0.5) * width * depth;
    homes[k + 1] = positions[k + 1] = ((row + 0.3 + random() * 0.4) / rows - 0.5) * height * depth;
    homes[k + 2] = positions[k + 2] = z;
    sizes[i] = 0.65 + random() ** 2 * 1.85;
    phases[i] = random() * Math.PI * 2;
    sinPhases[i] = Math.sin(phases[i]); cosPhases[i] = Math.cos(phases[i]);
  }
  return {count, columns, rows, positions, homes, sizes, phases, sinPhases, cosPhases,
    velocities: new Float32Array(count * 3), influences: new Float32Array(count),
    width, height, time: 0, cursorX: 0, cursorY: 0, previousX: 0, previousY: 0,
    velocityX: 0, velocityY: 0, strength: 0, speed: 0, active: false};
}

/** Preserve normalized anchors and displacement on resize; do not reseed the field. */
export function resizeSwarm(state: ParticleSwarm, width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
  if (state.width === width && state.height === height) return;
  const sx = width / state.width, sy = height / state.height;
  for (let i = 0; i < state.count * 3; i += 3) {
    state.positions[i] *= sx; state.positions[i + 1] *= sy;
    state.homes[i] *= sx; state.homes[i + 1] *= sy;
    state.velocities[i] *= sx; state.velocities[i + 1] *= sy;
  }
  state.cursorX *= sx; state.previousX *= sx; state.velocityX *= sx;
  state.cursorY *= sy; state.previousY *= sy; state.velocityY *= sy;
  state.width = width; state.height = height;
}

/**
 * Slow ambient trajectories + bounded magnetic deflection + overdamped springs.
 * Influence is evaluated from the original trajectory, so attraction cannot feed
 * on itself and collapse the field. No per-frame objects or arrays are allocated.
 */
export function stepSwarm(state: ParticleSwarm, input: SwarmInput, frameDelta: number) {
  if (!Number.isFinite(frameDelta) || frameDelta <= 0) return;
  const dt = Math.min(frameDelta, MAX_FRAME_DELTA);
  const active = input.active && Number.isFinite(input.x) && Number.isFinite(input.y);
  const targetX = clamp(Number.isFinite(input.x) ? input.x : 0, -1, 1) * state.width * 0.5;
  const targetY = clamp(Number.isFinite(input.y) ? input.y : 0, -1, 1) * state.height * 0.5;
  if (active && !state.active) {
    state.cursorX = state.previousX = targetX; state.cursorY = state.previousY = targetY;
    state.velocityX = state.velocityY = 0;
  }
  const smoothing = 1 - Math.exp(-5 * dt);
  const rawVX = active ? clamp((targetX - state.previousX) / dt, -40, 40) : 0;
  const rawVY = active ? clamp((targetY - state.previousY) / dt, -40, 40) : 0;
  state.velocityX += (rawVX - state.velocityX) * smoothing;
  state.velocityY += (rawVY - state.velocityY) * smoothing;
  state.previousX = targetX; state.previousY = targetY; state.active = active;
  state.cursorX += (targetX - state.cursorX) * smoothing;
  state.cursorY += (targetY - state.cursorY) * smoothing;
  state.strength += ((active ? 1 : 0) - state.strength) * (1 - Math.exp(-2.2 * dt));
  state.speed = Math.hypot(state.velocityX, state.velocityY);
  const radius = clamp(Math.min(state.width, state.height) * 0.38, 1.4, 3.6);
  const radiusSquared = radius * radius;
  const cellWidth = state.width / state.columns, cellHeight = state.height / state.rows;
  const substeps = Math.min(3, Math.ceil(dt * 60)), h = dt / substeps;
  const friction = Math.exp(-7 * h);
  const p = state.positions, v = state.velocities, home = state.homes;
  for (let step = 0; step < substeps; step++) {
    state.time += h;
    // Four trig operations per substep; per-particle phases were precomputed.
    const sx = Math.sin(state.time * 0.14), cx = Math.cos(state.time * 0.14);
    const sy = Math.sin(state.time * 0.11), cy = Math.cos(state.time * 0.11);
    for (let i = 0; i < state.count; i++) {
      const k = i * 3, depth = (PARTICLE_CAMERA_Z - home[k + 2]) / PARTICLE_CAMERA_Z;
      const orbitX = home[k] + cellWidth * depth * 0.12 * (sx * state.cosPhases[i] + cx * state.sinPhases[i]);
      const orbitY = home[k + 1] + cellHeight * depth * 0.12 * (cy * state.cosPhases[i] - sy * state.sinPhases[i]);
      const dx = state.cursorX * depth - orbitX, dy = state.cursorY * depth - orbitY;
      const distanceSquared = (dx * dx + dy * dy) / (depth * depth);
      const falloff = 1 / (1 + distanceSquared / radiusSquared);
      const influence = falloff * falloff * state.strength;
      // A wide, weak field with a small tangential component, no hard core.
      const offsetX = clamp((dx * 0.035 - dy * 0.055) * influence, -cellWidth * depth * 0.16, cellWidth * depth * 0.16);
      const offsetY = clamp((dy * 0.035 + dx * 0.055) * influence, -cellHeight * depth * 0.16, cellHeight * depth * 0.16);
      const ax = (orbitX + offsetX - p[k]) * 10, ay = (orbitY + offsetY - p[k + 1]) * 10;
      v[k] = clamp((v[k] + ax * h) * friction, -cellWidth * depth * 0.7, cellWidth * depth * 0.7);
      v[k + 1] = clamp((v[k + 1] + ay * h) * friction, -cellHeight * depth * 0.7, cellHeight * depth * 0.7);
      v[k + 2] = 0; // Preserve depth instead of flattening particles toward the cursor.
      p[k] += v[k] * h; p[k + 1] += v[k + 1] * h;
      state.influences[i] = influence;
    }
  }
}
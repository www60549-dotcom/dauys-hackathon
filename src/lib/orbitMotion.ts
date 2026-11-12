export const PLANET_FOV = 42;
export const PLANET_HOVER_SCALE = 1.05;
export const PLANET_PULSE_SCALE = 1.012;
export const PLANET_FLOAT_PX = 8;
export const SATELLITE_GLOW_RADIUS = 0.11;
export const ORBITS = {
  inner: {radius: 1.4, x: 1.18, y: -0.3, z: 0.18, speed: 0.22, phase: 0.35},
  outer: {radius: 1.72, x: 1.04, y: 0.18, z: -0.35, speed: -0.18, phase: 0.68},
} as const;

export interface OrbitPose {x: number; y: number; z: number; spin: number}
export interface OrbitFrame {inner: OrbitPose; outer: OrbitPose}

export function createOrbitFrame(): OrbitFrame {
  return {inner: {...ORBITS.inner, spin: ORBITS.inner.phase}, outer: {...ORBITS.outer, spin: ORBITS.outer.phase}};
}

/** Plane tilt stays bounded; only a child rotates around the plane's local Z. */
export function updateOrbitFrame(time: number, frame: OrbitFrame) {
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  frame.inner.x = ORBITS.inner.x + Math.sin(t * 0.18) * 0.025;
  frame.inner.y = ORBITS.inner.y + Math.sin(t * 0.15) * 0.025;
  frame.inner.z = ORBITS.inner.z + Math.sin(t * 0.12) * 0.02;
  frame.inner.spin = (ORBITS.inner.phase + t * ORBITS.inner.speed) % (Math.PI * 2);
  frame.outer.x = ORBITS.outer.x + Math.sin(t * 0.14) * 0.025;
  frame.outer.y = ORBITS.outer.y + Math.sin(t * 0.11) * 0.025;
  frame.outer.z = ORBITS.outer.z + Math.sin(t * 0.09) * 0.02;
  frame.outer.spin = (ORBITS.outer.phase + t * ORBITS.outer.speed) % (Math.PI * 2);
}

/** Fit a bounding sphere along the narrower camera axis, including the moon/hover. */
export function planetCameraDistance(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 7;
  const tangent = Math.tan(PLANET_FOV * Math.PI / 360);
  const usableX = Math.max(0.4, 1 - 24 / width);
  const usableY = Math.max(0.4, 1 - 2 * (PLANET_FLOAT_PX + 12) / height);
  const halfAngle = Math.atan(Math.min(tangent * width / height * usableX, tangent * usableY));
  const radius = (ORBITS.outer.radius + SATELLITE_GLOW_RADIUS) * PLANET_HOVER_SCALE * PLANET_PULSE_SCALE + 0.035;
  return radius / Math.sin(halfAngle);
}

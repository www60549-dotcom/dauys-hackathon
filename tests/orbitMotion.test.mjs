import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

const source = await readFile(new URL('../src/lib/orbitMotion.ts', import.meta.url), 'utf8');
const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}});
const {ORBITS, PLANET_FOV, PLANET_FLOAT_PX, PLANET_HOVER_SCALE, PLANET_PULSE_SCALE, SATELLITE_GLOW_RADIUS, createOrbitFrame, updateOrbitFrame, planetCameraDistance} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('orbit planes stay bounded over time; only in-plane spin accumulates', () => {
  const frame = createOrbitFrame();
  for (let time = 0; time <= 86400; time += 137) {
    updateOrbitFrame(time, frame);
    for (const key of ['inner', 'outer']) {
      assert.ok(Math.abs(frame[key].x - ORBITS[key].x) <= 0.025001);
      assert.ok(Math.abs(frame[key].y - ORBITS[key].y) <= 0.025001);
      assert.ok(Math.abs(frame[key].z - ORBITS[key].z) <= 0.020001);
      assert.ok(Math.abs(frame[key].spin) < Math.PI * 2);
    }
  }
  updateOrbitFrame(0, frame);
  const inner = frame.inner.spin, outer = frame.outer.spin;
  updateOrbitFrame(1, frame);
  assert.ok((frame.inner.spin - inner) * (frame.outer.spin - outer) < 0);
});

test('satellite remains on the ring in the shared floating planet hierarchy', () => {
  const rig = new THREE.Group(), floating = new THREE.Group(), plane = new THREE.Group(), spin = new THREE.Group(), moon = new THREE.Object3D();
  rig.add(floating); floating.add(plane); plane.add(spin); spin.add(moon);
  moon.position.x = ORBITS.outer.radius;
  const frame = createOrbitFrame(), center = new THREE.Vector3(), location = new THREE.Vector3();
  rig.scale.setScalar(PLANET_HOVER_SCALE); floating.scale.setScalar(PLANET_PULSE_SCALE);
  for (let t = 0; t < 3600; t += 7) {
    updateOrbitFrame(t, frame);
    rig.rotation.set(-0.08, 0.12, 0);
    floating.position.set(Math.sin(t * 0.35) * 0.025, Math.sin(t) * 0.1, 0);
    plane.rotation.set(frame.outer.x, frame.outer.y, frame.outer.z);
    spin.rotation.z = frame.outer.spin;
    rig.updateMatrixWorld(true);
    floating.getWorldPosition(center); moon.getWorldPosition(location);
    assert.ok(Math.abs(location.distanceTo(center) - ORBITS.outer.radius * PLANET_HOVER_SCALE * PLANET_PULSE_SCALE) < 0.000001);
  }
});

test('camera contains both rings and moon through resize, hover and parallax extremes', () => {
  const frame = createOrbitFrame(), point = new THREE.Vector3();
  const rig = new THREE.Group(), floating = new THREE.Group(), plane = new THREE.Group(), spin = new THREE.Group();
  rig.add(floating); floating.add(plane); plane.add(spin);
  rig.scale.setScalar(PLANET_HOVER_SCALE); floating.scale.setScalar(PLANET_PULSE_SCALE);
  for (const [width, height] of [[180, 320], [280, 320], [350, 320], [480, 440], [700, 440]]) {
    const camera = new THREE.PerspectiveCamera(PLANET_FOV, width / height, 0.1, 100);
    camera.position.z = planetCameraDistance(width, height);
    camera.updateMatrixWorld();
    const worldHeight = 2 * camera.position.z * Math.tan(PLANET_FOV * Math.PI / 360);
    for (let t = 0; t < 900; t += 13) for (const cursor of [-1, 1]) {
      updateOrbitFrame(t, frame);
      rig.rotation.set(-cursor * 0.08, cursor * 0.12, 0);
      floating.position.set(Math.sin(t * 0.35) * 0.025, Math.sin(t * Math.PI / 2) * PLANET_FLOAT_PX * worldHeight / height, 0);
      for (const key of ['inner', 'outer']) {
        plane.rotation.set(frame[key].x, frame[key].y, frame[key].z);
        spin.rotation.z = frame[key].spin;
        rig.updateMatrixWorld(true);
        for (let i = 0; i < 96; i++) {
          const angle = i * Math.PI * 2 / 96;
          point.set(Math.cos(angle) * ORBITS[key].radius, Math.sin(angle) * ORBITS[key].radius, 0).applyMatrix4(spin.matrixWorld).project(camera);
          assert.ok(Math.abs(point.x) < 0.99 && Math.abs(point.y) < 0.99, `${width}x${height}, ${key}, t=${t}`);
        }
        if (key === 'outer') for (let i = 0; i < 24; i++) {
          const angle = i * Math.PI * 2 / 24;
          point.set(ORBITS.outer.radius + Math.cos(angle) * SATELLITE_GLOW_RADIUS, Math.sin(angle) * SATELLITE_GLOW_RADIUS, 0).applyMatrix4(spin.matrixWorld).project(camera);
          assert.ok(Math.abs(point.x) < 0.99 && Math.abs(point.y) < 0.99, `moon clipped at ${width}x${height}`);
        }
      }
    }
  }
});

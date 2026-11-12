import {useCallback, useMemo, useRef, useState} from 'react';
import {Canvas, useFrame, useThree} from '@react-three/fiber';
import {useReducedMotion} from 'framer-motion';
import * as THREE from 'three';
import {useRenderActivity} from '../../hooks/useRenderActivity';
import {createSwarm, PARTICLE_CAMERA_Z, PARTICLE_COUNT, resizeSwarm, stepSwarm} from '../../lib/particlePhysics';
import type {PointerRef} from '../../types';
import {AdaptiveResolution, ContextLossGuard, SceneBoundary} from './SceneSupport';
import {particleFragmentShader, particleVertexShader} from './particleShaders';

function ParticleCloud({pointer, running}: {pointer: PointerRef; running: boolean}) {
  const {viewport, gl} = useThree();
  const geometry = useRef<THREE.BufferGeometry>(null);
  const simulation = useRef<ReturnType<typeof createSwarm> | null>(null);
  if (!simulation.current) simulation.current = createSwarm(PARTICLE_COUNT, 41, viewport.width, viewport.height);
  const swarm = simulation.current;
  const input = useRef({x: 0, y: 0, active: false});
  const uniforms = useMemo(() => ({uPixelRatio: {value: 1}, uMotion: {value: 0}, uDirection: {value: new THREE.Vector2(1, 0)}}), []);
  useFrame((_, delta) => {
    const resized = swarm.width !== viewport.width || swarm.height !== viewport.height;
    if (resized) resizeSwarm(swarm, viewport.width, viewport.height);
    if (running) {
      input.current.x = pointer.current.x; input.current.y = pointer.current.y;
      input.current.active = pointer.current.active !== false;
      stepSwarm(swarm, input.current, delta);
      uniforms.uMotion.value = Math.min(1, swarm.speed / 12);
      uniforms.uDirection.value.set(swarm.velocityX / Math.max(1, swarm.width), -swarm.velocityY / Math.max(1, swarm.height));
      if (uniforms.uDirection.value.lengthSq() < 0.00000001) uniforms.uDirection.value.set(1, 0);
      else uniforms.uDirection.value.normalize();
    }
    uniforms.uPixelRatio.value = gl.getPixelRatio();
    if (geometry.current && (resized || running)) {
      geometry.current.attributes.position.needsUpdate = true;
      geometry.current.attributes.aInfluence.needsUpdate = true;
    }
  });
  return <points frustumCulled={false} renderOrder={0}>
    <bufferGeometry ref={geometry}>
      <bufferAttribute attach="attributes-position" args={[swarm.positions, 3]} usage={THREE.DynamicDrawUsage}/>
      <bufferAttribute attach="attributes-aInfluence" args={[swarm.influences, 1]} usage={THREE.DynamicDrawUsage}/>
      <bufferAttribute attach="attributes-aSize" args={[swarm.sizes, 1]}/>
      <bufferAttribute attach="attributes-aPhase" args={[swarm.phases, 1]}/>
    </bufferGeometry>
    <shaderMaterial uniforms={uniforms} vertexShader={particleVertexShader} fragmentShader={particleFragmentShader}
      transparent depthWrite={false} depthTest={false} blending={THREE.NormalBlending} toneMapped={false}/>
  </points>;
}

export function BackgroundParticles({pointer, paused = false}: {pointer: PointerRef; paused?: boolean}) {
  const reduced = !!useReducedMotion();
  const {ref, active} = useRenderActivity();
  const [lost, setLost] = useState(false);
  const onLoss = useCallback(() => setLost(true), []);
  const running = active && !reduced && !paused;
  return <div ref={ref} className="particle-background" aria-hidden="true" data-particles={lost ? 0 : PARTICLE_COUNT} data-motion={running ? 'running' : 'paused'}>
    {!lost && <SceneBoundary fallback={null}>
      <Canvas camera={{position: [0, 0, PARTICLE_CAMERA_Z], fov: 55}} dpr={1} frameloop={running ? 'always' : 'demand'}
        gl={{alpha: true, antialias: false, depth: false, powerPreference: 'low-power'}} fallback={null}>
        <ContextLossGuard onLoss={onLoss}/><AdaptiveResolution running={running}/>
        <ParticleCloud pointer={pointer} running={running}/>
      </Canvas>
    </SceneBoundary>}
  </div>;
}

import {useLayoutEffect, useMemo, useRef, type RefObject} from 'react';
import {useFrame, useThree} from '@react-three/fiber';
import {Environment, Lightformer} from '@react-three/drei';
import * as THREE from 'three';
import type {PointerRef} from '../../types';
import {causticFragmentShader, causticVertexShader} from './particleShaders';
import {createOrbitFrame, ORBITS, PLANET_FLOAT_PX, PLANET_HOVER_SCALE, planetCameraDistance, updateOrbitFrame} from '../../lib/orbitMotion';

export function FitPlanetCamera() {
  const {camera, size, invalidate} = useThree();
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || size.width <= 0 || size.height <= 0) return;
    camera.position.set(0, 0, planetCameraDistance(size.width, size.height));
    camera.aspect = size.width / Math.max(1, size.height);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);
  return null;
}

export function StudioLighting({pointer, running}: {pointer: PointerRef; running: boolean}) {
  const key = useRef<THREE.DirectionalLight>(null);
  useFrame((_, delta) => {
    if (!running || !key.current) return;
    const dt = Math.min(delta, 0.05), p = pointer.current;
    key.current.position.x = THREE.MathUtils.damp(key.current.position.x, -3 + p.x * 3.5, 4, dt);
    key.current.position.y = THREE.MathUtils.damp(key.current.position.y, 4 + p.y * 2.2, 4, dt);
  });
  return <>
    <ambientLight intensity={0.65}/>
    <directionalLight ref={key} position={[-3, 4, 5]} intensity={3.1} color="#edf8ff"/>
    <pointLight position={[3, -2, 3]} intensity={10} color="#3969ff" distance={12}/>
    <Environment frames={1} resolution={128}>
      <Lightformer intensity={3.5} color="#effbff" position={[-3, 4, 3]} scale={[4, 2, 1]} rotation={[0, Math.PI / 4, 0]}/>
      <Lightformer intensity={2} color="#b6eaff" position={[3, 1, -2]} scale={[2, 5, 1]} rotation={[0, -Math.PI / 2, 0]}/>
      <Lightformer intensity={1.4} color="#5276ff" position={[0, -4, 2]} scale={[5, 2, 1]} rotation={[Math.PI / 3, 0, 0]}/>
    </Environment>
  </>;
}

export function PlanetRig({pointer, hovered, running}: {pointer: PointerRef; hovered: RefObject<boolean>; running: boolean}) {
  const rig = useRef<THREE.Group>(null), floating = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null), outer = useRef<THREE.Group>(null);
  const innerSpin = useRef<THREE.Group>(null), outerSpin = useRef<THREE.Group>(null), time = useRef(0);
  const orbitFrame = useMemo(createOrbitFrame, []);
  const {size, camera} = useThree();
  const causticUniforms = useMemo(() => ({uTime: {value: 0}, uLight: {value: new THREE.Vector2()}}), []);
  useFrame((_, delta) => {
    if (!running || !rig.current || !floating.current || !inner.current || !outer.current || !innerSpin.current || !outerSpin.current) return;
    const dt = Math.min(delta, 0.05), t = time.current += dt;
    const p = pointer.current;
    // Keep parallax inside the shared rig; the Canvas itself never moves/resizes.
    rig.current.rotation.y = THREE.MathUtils.damp(rig.current.rotation.y, p.x * 0.12, 3, dt);
    rig.current.rotation.x = THREE.MathUtils.damp(rig.current.rotation.x, -p.y * 0.08, 3, dt);
    rig.current.scale.setScalar(THREE.MathUtils.damp(rig.current.scale.x, hovered.current ? PLANET_HOVER_SCALE : 1, 5, dt));
    const worldHeight = camera instanceof THREE.PerspectiveCamera ? 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360) : 4;
    floating.current.position.y = Math.sin(t * Math.PI / 2) * (PLANET_FLOAT_PX * worldHeight / Math.max(1, size.height));
    floating.current.position.x = Math.sin(t * 0.35) * 0.025;
    floating.current.scale.setScalar(1 + Math.sin(t * 1.1) * 0.012);
    updateOrbitFrame(t, orbitFrame);
    inner.current.rotation.set(orbitFrame.inner.x, orbitFrame.inner.y, orbitFrame.inner.z);
    outer.current.rotation.set(orbitFrame.outer.x, orbitFrame.outer.y, orbitFrame.outer.z);
    innerSpin.current.rotation.z = orbitFrame.inner.spin;
    outerSpin.current.rotation.z = orbitFrame.outer.spin;
    causticUniforms.uTime.value = t;
    causticUniforms.uLight.value.x = THREE.MathUtils.damp(causticUniforms.uLight.value.x, p.x, 4, dt);
    causticUniforms.uLight.value.y = THREE.MathUtils.damp(causticUniforms.uLight.value.y, p.y, 4, dt);
  });
  return <group ref={rig}>
    <mesh position={[0, -1.31, -0.4]} rotation={[-0.25, 0, 0]}>
      <planeGeometry args={[3.1, 0.65]}/>
      <shaderMaterial uniforms={causticUniforms} vertexShader={causticVertexShader} fragmentShader={causticFragmentShader} transparent depthWrite={false}/>
    </mesh>
    <group ref={floating}>
      <mesh>
        <sphereGeometry args={[0.99, 48, 32]}/>
        <meshPhysicalMaterial color="#2765ef" roughness={0.36} metalness={0.06} clearcoat={1} emissive="#102ab0" emissiveIntensity={0.08}/>
      </mesh>
      <mesh>
        <sphereGeometry args={[1.105, 64, 48]}/>
        <meshPhysicalMaterial color="#c2e4ff" transmission={0.95} roughness={0.08} thickness={1.5} ior={1.5} iridescence={0.3}
          iridescenceIOR={1.32} iridescenceThicknessRange={[150, 350]} clearcoat={1} clearcoatRoughness={0.05} metalness={0} envMapIntensity={1.35}/>
      </mesh>
      <group ref={inner} rotation={[ORBITS.inner.x, ORBITS.inner.y, ORBITS.inner.z]}>
        <group ref={innerSpin} rotation={[0, 0, ORBITS.inner.phase]}>
          <mesh><torusGeometry args={[ORBITS.inner.radius, 0.011, 8, 160]}/><meshStandardMaterial color="#6ca8ff" emissive="#346fff" emissiveIntensity={2.2} roughness={0.3} toneMapped={false}/></mesh>
          <mesh><torusGeometry args={[ORBITS.inner.radius, 0.033, 6, 160]}/><meshBasicMaterial color="#608fff" transparent opacity={0.14} depthWrite={false} blending={THREE.AdditiveBlending}/></mesh>
          <mesh position={[ORBITS.inner.radius, 0, 0]}><sphereGeometry args={[0.028, 12, 8]}/><meshBasicMaterial color="#b9e7ff" toneMapped={false}/></mesh>
        </group>
      </group>
      <group ref={outer} rotation={[ORBITS.outer.x, ORBITS.outer.y, ORBITS.outer.z]}>
        <group ref={outerSpin} rotation={[0, 0, ORBITS.outer.phase]}>
        <mesh><torusGeometry args={[ORBITS.outer.radius, 0.006, 6, 192]}/><meshStandardMaterial color="#8c9fe4" metalness={0.35} roughness={0.25} emissive="#597fe3" emissiveIntensity={0.2}/></mesh>
        <mesh position={[ORBITS.outer.radius, 0, 0]}>
          <sphereGeometry args={[0.065, 20, 16]}/>
          <meshStandardMaterial color="#d5ff97" emissive="#bef573" emissiveIntensity={0.8} roughness={0.2} toneMapped={false}/>
          <mesh><sphereGeometry args={[0.11, 12, 12]}/><meshBasicMaterial color="#c5fc85" transparent opacity={0.14} depthWrite={false}/></mesh>
        </mesh>
        </group>
      </group>
    </group>
  </group>;
}

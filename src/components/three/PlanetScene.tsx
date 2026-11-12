import {useCallback, useMemo, useRef, useState} from 'react';
import {Canvas} from '@react-three/fiber';
import {useReducedMotion} from 'framer-motion';
import {Pause, Play} from 'lucide-react';
import {useRenderActivity} from '../../hooks/useRenderActivity';
import type {PointerRef} from '../../types';
import {AdaptiveResolution, ContextLossGuard, SceneBoundary} from './SceneSupport';
import {FitPlanetCamera, PlanetRig, StudioLighting} from './PlanetRig';
import {PLANET_FOV} from '../../lib/orbitMotion';

export {BackgroundParticles} from './SwarmBackground';

function FallbackPlanet() {
  return <div className="fallback-planet" aria-hidden="true"><span className="fallback-sphere"/><span className="fallback-orbit"/><span className="fallback-orbit fallback-orbit-outer"/><span className="fallback-moon"/></div>;
}

interface Props {
  pointer: PointerRef;
  paused?: boolean;
  motionPaused?: boolean;
  onToggleMotion?: () => void;
}

export default function PlanetScene({pointer, paused = false, motionPaused = false, onToggleMotion}: Props) {
  const reduced = !!useReducedMotion();
  const {ref, active} = useRenderActivity();
  const hovered = useRef(false);
  const [ready, setReady] = useState(false), [lost, setLost] = useState(false);
  const onLoss = useCallback(() => setLost(true), []);
  const running = active && !reduced && !paused;
  const cameraOptions = useMemo(() => ({position: [0, 0, 7] as [number, number, number], fov: PLANET_FOV}), []);
  return <section ref={ref} className="orb-stage" aria-label="3D-сцена Dauys" data-renderer={lost ? 'fallback' : ready ? 'webgl' : 'loading'}
    onPointerEnter={() => { hovered.current = true; }} onPointerLeave={() => { hovered.current = false; }}>
    <div className="planet-viewport" role="img" aria-label="Стеклянная голубая планета с двумя встречными орбитами и светящимся спутником">
      <div className="orb-halo"/><div className="orb-shadow"/>
      {lost ? <FallbackPlanet/> : <SceneBoundary fallback={<FallbackPlanet/>}>
        <Canvas camera={cameraOptions} resize={{offsetSize: true}} dpr={[1, 1.25]} frameloop={running ? 'always' : 'demand'}
          gl={{alpha: true, antialias: true, powerPreference: 'default'}} fallback={<FallbackPlanet/>} onCreated={() => setReady(true)}>
          <ContextLossGuard onLoss={onLoss}/><AdaptiveResolution running={running}/>
          <FitPlanetCamera/>
          <StudioLighting pointer={pointer} running={running}/>
          <PlanetRig pointer={pointer} hovered={hovered} running={running}/>
        </Canvas>
      </SceneBoundary>}
    </div>
    {onToggleMotion && <button type="button" className="scene-motion-control" disabled={reduced || lost || !ready} aria-pressed={motionPaused} onClick={onToggleMotion}>
      {motionPaused || reduced ? <Play size={14}/> : <Pause size={14}/>}{reduced ? 'Движение уменьшено' : motionPaused ? 'Продолжить 3D' : 'Пауза 3D'}
    </button>}
  </section>;
}

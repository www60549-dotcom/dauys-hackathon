import {lazy, Suspense} from 'react';
import type {PointerRef} from '../types';

const PlanetScene = lazy(() => import('./three/PlanetScene'));

export function DauysPlanet({pointer, paused = false, compact = false}: {pointer: PointerRef; paused?: boolean; compact?: boolean}) {
  return <div className={compact ? 'dauys-planet is-compact' : 'dauys-planet'} aria-hidden="true">
    <Suspense fallback={<div className="orb-stage"><div className="fallback-planet"><span className="fallback-sphere"/><span className="fallback-orbit"/><span className="fallback-moon"/></div></div>}>
      <PlanetScene pointer={pointer} paused={paused}/>
    </Suspense>
  </div>;
}

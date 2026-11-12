import {Component, useEffect, useRef, type ReactNode} from 'react';
import {useFrame, useThree} from '@react-three/fiber';

export class SceneBoundary extends Component<{children: ReactNode; fallback: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Keep the full particle field; lower pixel workload after sustained slow frames. */
export function AdaptiveResolution({running}: {running: boolean}) {
  const {gl, setDpr} = useThree();
  const budget = useRef({warmup: 0, elapsed: 0, frames: 0, slowWindows: 0});
  useFrame((_, delta) => {
    const sample = budget.current;
    if (!running || delta > 0.15) {
      sample.warmup = sample.elapsed = sample.frames = sample.slowWindows = 0;
      return;
    }
    if (sample.warmup < 2) { sample.warmup += delta; return; }
    sample.elapsed += delta; sample.frames++;
    if (sample.elapsed < 1.5) return;
    sample.slowWindows = sample.frames / sample.elapsed < 50 ? sample.slowWindows + 1 : 0;
    sample.elapsed = sample.frames = 0;
    if (sample.slowWindows >= 2) {
      const current = gl.getPixelRatio();
      if (current > 0.86) setDpr(Math.max(0.85, current * 0.8));
      sample.slowWindows = 0;
    }
  });
  return null;
}

export function ContextLossGuard({onLoss}: {onLoss: () => void}) {
  const canvas = useThree(state => state.gl.domElement);
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onLoss(); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [canvas, onLoss]);
  return null;
}

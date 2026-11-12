import {useEffect, useRef} from 'react';
import type {PointerRef} from '../types';

/** Pointer samples stay outside React state: moving the mouse never rerenders the UI. */
export function usePagePointer(): PointerRef {
  const pointer = useRef({x: 0, y: 0, active: false});
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointer.current.x = event.clientX / window.innerWidth * 2 - 1;
      pointer.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
      pointer.current.active = true;
    };
    const reset = () => { pointer.current.x = 0; pointer.current.y = 0; pointer.current.active = false; };
    window.addEventListener('pointermove', move, {passive: true});
    document.documentElement.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
    };
  }, []);
  return pointer;
}

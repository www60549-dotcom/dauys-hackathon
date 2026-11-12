import {useEffect, useRef} from 'react';
import {animate, useInView, useMotionValue, useMotionValueEvent, useReducedMotion} from 'framer-motion';
import {formatNumber} from '../lib/utils';

export function CountUp({value, suffix = '', decimals = 0}: {value: number; suffix?: string; decimals?: number}) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, {once: true, amount: 0.3});
  const reduced = !!useReducedMotion();
  const count = useMotionValue(0);
  useMotionValueEvent(count, 'change', current => {
    if (ref.current) ref.current.textContent = formatNumber(current, decimals);
  });
  useEffect(() => {
    if (!visible) return;
    if (reduced) { count.set(value); if (ref.current) ref.current.textContent = formatNumber(value, decimals); return; }
    const animation = animate(count, value, {duration: 1.2, ease: [0.16, 1, 0.3, 1]});
    return () => animation.stop();
  }, [visible, reduced, count, value, decimals]);
  return <span aria-label={`${formatNumber(value, decimals)}${suffix}`} className="numeric"><span ref={ref} aria-hidden="true">0</span><span aria-hidden="true">{suffix}</span></span>;
}

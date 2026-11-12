import {useEffect, useRef, useState} from 'react';

/** Pause GPU work in background tabs and when a scene is outside the viewport. */
export function useRenderActivity() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', change);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {rootMargin: '100px'});
    if (ref.current) observer.observe(ref.current);
    return () => { document.removeEventListener('visibilitychange', change); observer.disconnect(); };
  }, []);
  return {ref, active: inView && visible};
}

// The rendered width of an element (ResizeObserver): charts draw at their real size, so text in
// the SVG stays at its real size on a phone (a scaled viewBox would shrink it).
import { useEffect, useRef, useState } from 'react';

export function useWidth(fallback = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => { if (el.clientWidth > 0) setWidth(el.clientWidth); };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

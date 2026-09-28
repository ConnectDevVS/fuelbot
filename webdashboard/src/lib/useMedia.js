// A media query as React state (no polling: matchMedia change events).
import { useSyncExternalStore } from 'react';

export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// The dashboard's three layouts (dashboard plan §2.9).
export const WIDE = '(min-width: 1100px)';     // sidebar with labels
export const MEDIUM = '(min-width: 760px)';    // icon rail; below: top bar + tab bar

/** 'desktop' | 'tablet' | 'phone' */
export function useLayoutSize() {
  const wide = useMediaQuery(WIDE);
  const medium = useMediaQuery(MEDIUM);
  if (wide) return 'desktop';
  return medium ? 'tablet' : 'phone';
}

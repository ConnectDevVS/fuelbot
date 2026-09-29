// A value that follows another after `ms` of quiet (filter changes → one request, dashboard plan
// §2.6). The first value is taken at once, so a page's first load isn't delayed.
import { useEffect, useState } from 'react';

export function useDebounced(value, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (settled === value) return undefined;
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms, settled]);
  return settled;
}

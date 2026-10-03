import { useEffect, useState } from 'preact/hooks';

/** The current time, updated every `everyMs` while `ticking` (for running clocks). */
export function useNow(ticking: boolean, everyMs = 250): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [ticking, everyMs]);
  return ticking ? now : Date.now();
}

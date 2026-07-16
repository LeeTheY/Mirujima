import { useEffect, useState } from "react";

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const initial = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, intervalMs);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [intervalMs]);
  return now;
}

'use client';

import { useEffect, useState } from 'react';

/** Соответствует breakpoint `md` (900px), как в прежней теме MUI. */
export function useMdUp(breakpointPx = 900) {
  const [up, setUp] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpointPx}px)`);
    const fn = () => setUp(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [breakpointPx]);

  return up;
}

'use client';

import { useEffect, useState } from 'react';
import { Clock, TimerOff } from '@/components/ui/icons';
import { expiryState } from '@/features/customer/expiry';

/**
 * The countdown on a live quote.
 *
 * ⚠️ THE FIRST RENDER IS THE SERVER'S, AND THE TICK STARTS AFTER MOUNT. Rendering the clock during hydration
 * would produce a different string from the one in the HTML whenever a second ticked between the two, which is
 * a hydration mismatch. `initialLabel` comes from the server; the effect replaces it a moment later and then
 * every half minute.
 *
 * ⚠️ IT IS A DISPLAY, NOT A GATE. The database refuses an expired quote at acceptance time whatever this shows,
 * and the actionability helper refuses it in the page. A timer that a wrong clock could talk somebody into
 * clicking through would be a decoration pretending to be a control.
 */
export function ExpirationTimer({
  validUntil,
  initialLabel,
}: {
  validUntil: string | null;
  initialLabel: string;
}) {
  const [label, setLabel] = useState(initialLabel);

  useEffect(() => {
    if (!validUntil) return;
    const tick = () => {
      const state = expiryState(validUntil);
      if (state) setLabel(state.label);
    };
    tick();
    const handle = window.setInterval(tick, 30_000);
    return () => window.clearInterval(handle);
  }, [validUntil]);

  const expired = label.toLowerCase().startsWith('expired');

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-sans text-sm font-bold ${
        expired ? 'text-amber-800' : 'text-primary'
      }`}
    >
      {expired ? (
        <TimerOff aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Clock aria-hidden="true" className="h-4 w-4" />
      )}
      {label}
    </span>
  );
}

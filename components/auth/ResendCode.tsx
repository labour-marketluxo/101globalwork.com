'use client';

import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { AUTH_TEXT_BUTTON } from '@/components/auth/AuthSections';

/**
 * The resend control, with the cooldown the provider enforces.
 *
 * WHY THE COUNTDOWN IS DRIVEN BY A TIMESTAMP, NOT BY A CLIENT TIMER. The clock has to survive a
 * reload, a back button and a second tab. So the server records when it last sent a code, and this
 * component counts down to that instant — which means the display cannot drift away from the truth,
 * and a visitor who reloads does not get a fresh minute for free.
 *
 * HYDRATION. `initialSeconds` is computed on the server and passed in; the component seeds its
 * state from that number rather than calling `Date.now()` during render. Computing it locally would
 * make the server's HTML and the client's first render disagree by the fraction of a second between
 * them, which React reports as a hydration mismatch — a warning that looks like a bug in the page
 * and is really just two clocks.
 *
 * WHY IT DOES NOT ANNOUNCE EVERY SECOND: a live region counting down is unusable with a screen
 * reader. The button's accessible name changes — "Resend code in 0:45" becomes "Resend code" — and
 * that is announced when focus reaches it, which is when it matters.
 *
 * THE COOLDOWN IS ALSO ENFORCED SERVER-SIDE. A disabled attribute is a courtesy to the person
 * filling the form, not a control: the action refuses a resend inside the same window, so a
 * hand-crafted POST gets the same answer the button would have given.
 */
export function ResendCode({
  availableAt,
  initialSeconds,
}: {
  /** Epoch milliseconds when the next send is allowed. */
  availableAt: number;
  /** Seconds remaining at render time, computed on the server. */
  initialSeconds: number;
}) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const { pending } = useFormStatus();

  useEffect(() => {
    // No synchronous setState here: the value is seeded from `initialSeconds` (computed on the
    // server) and only ever changes from the interval callback. Setting it in the effect body
    // would render twice on mount for a number that is already correct.
    const timer = setInterval(() => {
      const next = secondsUntil(availableAt);
      setRemaining(next);
      if (next <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [availableAt]);

  const waiting = remaining > 0;
  const label = pending
    ? 'Sending…'
    : waiting
      ? `Resend code in ${formatCountdown(remaining)}`
      : 'Resend code';

  return (
    <button
      type="submit"
      disabled={pending || waiting}
      aria-busy={pending}
      className={`inline-flex items-center gap-1.5 ${AUTH_TEXT_BUTTON}`}
    >
      {label}
    </button>
  );
}

function secondsUntil(availableAt: number): number {
  return Math.max(0, Math.ceil((availableAt - Date.now()) / 1000));
}

/** `0:45`, matching the brief — and the same shape people see in an authenticator app. */
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

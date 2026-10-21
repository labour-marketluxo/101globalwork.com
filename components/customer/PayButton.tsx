'use client';

import { useFormStatus } from 'react-dom';
import { ArrowRight, Loader2 } from '@/components/ui/icons';

/**
 * The amber checkout button.
 *
 * ⚠️ THE DISABLED STATE IS A COURTESY, NOT THE CONTROL. `useFormStatus` reads the state of the server action
 * this button submits, so an ordinary double click cannot start two payments. What makes that safe rather
 * than merely tidy is that the request itself is idempotent — see `lib/payments/start-checkout.ts`, where the
 * attempt's key and a one-active-attempt index mean two simultaneous requests converge on one attempt and one
 * gateway session. This button exists so the visible behaviour matches the actual behaviour.
 */
export function PayButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-3 font-sans text-sm font-bold text-white shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-secondary"
    >
      {pending ? (
        <>
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Starting secure checkout…
        </>
      ) : (
        <>
          {label}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </>
      )}
    </button>
  );
}

/**
 * The same protection for the step-up form, which sends a one-time code.
 *
 * Sending two codes in a second invalidates the first, so the customer who clicks twice is the one harmed —
 * this time the disabled state is doing real work rather than describing work done elsewhere.
 */
export function SendCodeButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border-0 bg-primary px-5 py-3 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? 'Sending…' : label}
    </button>
  );
}

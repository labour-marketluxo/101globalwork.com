'use client';

import { useFormStatus } from 'react-dom';
import { CircleCheck, Loader2, Power } from '@/components/ui/icons';
import { setAvailabilityAction } from '@/features/provider-workspace/actions';

/**
 * The two interactive controls the provider workspace needs on the server-rendered pages.
 *
 * ⚠️ THEY ARE FORMS, NOT `onClick` HANDLERS CALLING AN ENDPOINT. Every one of these submits to a
 * server action, so each control keeps working with no JavaScript at all — which matters on the
 * connection this page is designed for. The disabled/pending state is a courtesy that stops a second
 * tap on a slow link; it is not what makes the write safe.
 */

/** Submit button with a pending state, for use inside any server-action form. */
export function PendingButton({
  idle,
  pending,
  className,
  icon,
  formAction,
  name,
  value,
}: {
  idle: string;
  pending: string;
  className: string;
  icon?: React.ReactNode;
  /**
   * A second server action for one form with several buttons — "Save draft" beside "Submit quotation". The
   * pending state is the form's, so every button in that form disables while any of them is in flight, which
   * is the behaviour you want: two different writes fired from the same half-filled form is never intended.
   */
  formAction?: (formData: FormData) => void | Promise<void>;
  /**
   * The pressed button's own entry, for a form whose outcome depends on WHICH button was pressed rather than
   * which action ran — "reject" beside "ask for more information". React puts the submitter's name and value
   * into the FormData, so the two buttons reach one action with different data instead of needing two.
   */
  name?: string;
  value?: string;
}) {
  const { pending: isPending } = useFormStatus();
  return (
    <button type="submit" formAction={formAction} name={name} value={value} disabled={isPending} aria-busy={isPending} className={className}>
      {isPending ? (
        <>
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          {pending}
        </>
      ) : (
        <>
          {icon}
          {idle}
        </>
      )}
    </button>
  );
}

/**
 * The availability toggle.
 *
 * ⚠️ IT SUBMITS THE STATE IT WANTS, NOT "TOGGLE". The hidden field carries the value the write should
 * leave behind, computed from the state the page was rendered with. A plain toggle would be a
 * read-modify-write across a request, and two taps on a laggy connection would land as one change
 * plus one no-op — or, worse, as the provider going offline when they meant to go online.
 *
 * ⚠️ AMBER WHEN IT IS THE ACTION, TEAL WHEN IT IS THE STATE. Offline, the button is the thing to do
 * (amber, the platform's call-to-action colour). Online, it is a status with an escape hatch, so it
 * reads as teal on teal — a filled amber button sitting permanently on a page whose message is "you
 * are available" would be advertising an action nobody wants to take.
 */
export function AvailabilityToggle({
  providerId,
  acceptsNewWork,
  nextPath,
  variant = 'compact',
}: {
  providerId: string;
  acceptsNewWork: boolean;
  nextPath: string;
  variant?: 'compact' | 'hero';
}) {
  const hero = variant === 'hero';
  const className = hero
    ? `inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-sans text-sm font-bold tracking-wide uppercase shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70 ${
        acceptsNewWork
          ? 'border border-solid border-primary-subtle bg-primary-subtle text-primary hover:bg-white'
          : 'border-0 bg-secondary text-white hover:bg-secondary-dark'
      }`
    : `inline-flex items-center gap-2 rounded-lg px-3.5 py-2 font-sans text-xs font-bold tracking-wide uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70 ${
        acceptsNewWork
          ? 'border border-solid border-primary-subtle bg-primary-subtle text-primary hover:bg-white'
          : 'border-0 bg-secondary text-white hover:bg-secondary-dark'
      }`;

  return (
    <form action={setAvailabilityAction}>
      <input type="hidden" name="provider_id" value={providerId} />
      <input type="hidden" name="next" value={nextPath} />
      <input type="hidden" name="accepts_new_work" value={acceptsNewWork ? '0' : '1'} />
      <PendingButton
        idle={acceptsNewWork ? 'Online — tap to go offline' : 'Offline — tap to go online'}
        pending="Saving…"
        className={className}
        icon={
          acceptsNewWork ? (
            <CircleCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
          ) : (
            <Power aria-hidden="true" className="h-4 w-4 shrink-0" />
          )
        }
      />
    </form>
  );
}

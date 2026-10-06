import Link from 'next/link';
import { Check } from '@/components/ui/icons';
import {
  CUSTOMER_PATHS,
  INTAKE_FAILURE_COPY,
  INTAKE_STEPS,
  STEP_LABELS,
  intakeFailureCode,
  stepNumber,
  type IntakeStep,
} from '@/features/customer/intake';

/**
 * The chrome every step of the guided intake shares: the stepper, the notices, and the heading.
 *
 * SERVER COMPONENTS, DELIBERATELY. None of this holds state — the current step comes from the URL, and
 * the notices come from the query string — so there is nothing here to make interactive, and a client
 * component would ship the labels and the error copy to the browser for no reason.
 */

/**
 * The progress bar the brief calls a "stepper bar (Intent > Clarify > Logistics > Review)".
 *
 * The current step is marked with `aria-current="step"`, which is what a screen reader announces as
 * "current step" — a row of coloured dots is not information anyone who cannot see it can use. The
 * completed steps carry a tick as well as a colour, because colour alone is not a signal either.
 *
 * It wraps rather than scrolls. Four labels do not fit 360px, and an `overflow-x-auto` scroller here
 * would hide the last step — the one the visitor is trying to reach — off the right edge.
 */
export function StepBar({ current }: { current: IntakeStep }) {
  const currentNumber = stepNumber(current);

  return (
    <nav aria-label="Request progress" className="mb-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {INTAKE_STEPS.map(step => {
          const number = stepNumber(step);
          const done = number < currentNumber;
          const active = number === currentNumber;

          return (
            <li key={step} className="flex items-center gap-2">
              <span
                aria-current={active ? 'step' : undefined}
                className={`inline-flex items-center gap-2 rounded-full border border-solid px-3 py-1.5 font-mono text-[11px] font-bold tracking-wider uppercase ${
                  active
                    ? 'border-transparent bg-primary text-white'
                    : done
                      ? 'border-primary-subtle bg-primary-subtle text-primary'
                      : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                {done ? (
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                ) : (
                  <span aria-hidden="true">{number}</span>
                )}
                {STEP_LABELS[step]}
                {/* The number and the tick are decoration; this is the part that is read aloud. */}
                <span className="sr-only">
                  {active ? ' (current step)' : done ? ' (completed)' : ' (not started)'}
                </span>
              </span>
              {number < INTAKE_STEPS.length ? (
                <span aria-hidden="true" className="h-px w-4 bg-slate-300 sm:w-6" />
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${(currentNumber / INTAKE_STEPS.length) * 100}%` }}
        />
      </div>
      <p className="mt-2 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        Step {currentNumber} of {INTAKE_STEPS.length}
      </p>
    </nav>
  );
}

/**
 * The notices a step can show after a redirect: why a save failed, or that a save happened.
 *
 * ⚠️ THE FAILURE CODE IS A KEY, NOT A MESSAGE. It arrives in the query string, so a message in the URL
 * would let anyone put their own words on this page under the platform's own notice styling — which is
 * how reflected-message phishing works. `intakeFailureCode` only accepts five known values and
 * everything else renders nothing.
 *
 * The two notices are mutually exclusive: a step that failed to save shows the failure, and the stale
 * `saved=1` some browser retry left behind does not get to contradict it.
 */
export function IntakeNotice({ failed, saved }: { failed?: string; saved?: boolean }) {
  const code = intakeFailureCode(failed);

  if (!code && !saved) return null;

  return (
    <div className="mb-6 space-y-3">
      {code ? (
        <p
          role="alert"
          className="rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900"
        >
          {INTAKE_FAILURE_COPY[code]}
        </p>
      ) : null}

      {!code && saved ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          Draft saved. Nothing has been sent to any provider yet — a request is only visible to them
          once you submit it at the review step.
        </p>
      ) : null}
    </div>
  );
}

/**
 * A step's heading and its stepper, in the one order every step uses.
 *
 * The sub-navigation is not repeated here: the workspace bar above already says where this is, and a
 * second set of the same links inside a form is a second thing to keep pointing at the same place.
 */
export function IntakeStepShell({
  step,
  title,
  lede,
  failed,
  saved,
  children,
}: {
  step: IntakeStep;
  title: string;
  lede: string;
  failed?: string;
  saved?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <StepBar current={step} />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Step {stepNumber(step)} of {INTAKE_STEPS.length} — {STEP_LABELS[step]}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-primary sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{lede}</p>
        </div>

        <Link
          href={CUSTOMER_PATHS.dashboard}
          className="font-mono text-xs font-semibold text-slate-500 no-underline transition-colors hover:text-primary"
        >
          Cancel and leave
        </Link>
      </div>

      <IntakeNotice failed={failed} saved={saved} />

      {children}
    </section>
  );
}

/**
 * A note that facts live somewhere other than the page — used for the two things this platform cannot
 * do yet, so they are said in the same voice in both places instead of two different apologies.
 */
export function HonestGap({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-solid border-slate-200 bg-slate-50 px-4 py-3">
      <p className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">{title}</p>
      <div className="mt-1.5 text-sm leading-relaxed text-slate-600">{children}</div>
    </div>
  );
}

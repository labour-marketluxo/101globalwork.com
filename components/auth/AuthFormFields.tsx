'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Eye, EyeOff } from '@/components/ui/icons';
import { FIELD } from '@/components/discovery/tokens';
import { AUTH_CTA } from '@/components/auth/AuthSections';

/**
 * The interactive parts of the auth forms, and nothing else.
 *
 * WHY THE FORMS ARE STILL SERVER-RENDERED. Three controls need client state — the password
 * visibility toggle, the strength meter and the pending state on the submit button — so those
 * three are client components and everything around them (the card, the labels, the notice, the
 * radio group, the consent checkbox) stays on the server. The forms themselves post to server
 * actions, which means the sign-in and sign-up flows work without JavaScript at all; what is
 * lost without it is the eye icon, the meter and the spinner, not the ability to sign in.
 */

/**
 * Password input with a visibility toggle.
 *
 * THE BUTTON IS `type="button"`, which matters more than it looks: inside a form, a button with no
 * type submits it. An eye toggle that signs you in on the way to revealing your typo is a real
 * bug, and it is the default behaviour rather than a mistake you have to make.
 *
 * THE ACCESSIBLE NAME CHANGES WITH THE STATE, and `aria-pressed` is deliberately NOT set. Doing
 * both makes a screen reader announce "Show password, pressed, Hide password" — the state twice,
 * in the wrong order. The label alone is unambiguous and is the pattern the WAI's own examples
 * use for show/hide controls.
 */
export function PasswordField({
  id,
  name,
  label,
  labelAction,
  autoComplete,
  minLength,
  meter = false,
  describedBy,
}: {
  id: string;
  name: string;
  label: string;
  /** Right-aligned in the label row — the "Forgot password?" link, on sign-in. */
  labelAction?: React.ReactNode;
  autoComplete: 'current-password' | 'new-password';
  /** Mirrors the server rule, so the browser blocks what the action would reject. */
  minLength?: number;
  /** Sign-up only: the strength meter and the requirement list. */
  meter?: boolean;
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState('');
  const meterId = `${id}-strength`;

  const described = [describedBy, meter ? meterId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="block font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase"
        >
          {label}
        </label>
        {labelAction}
      </div>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          aria-describedby={described}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={`${FIELD} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg border-0 bg-transparent p-0 text-slate-500 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {visible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
        </button>
      </div>

      {meter ? <PasswordStrength id={meterId} value={value} minLength={minLength ?? 10} /> : null}
    </div>
  );
}

/**
 * A real-time strength meter that does not pretend to be a guarantee.
 *
 * WHAT IT MUST NOT DO: call a password "strong" and then have the server reject it, or reassure
 * someone about a password that is a single dictionary word with a capital letter and a `!` on the
 * end — which is what every naive length-and-variety score does. So the meter reports the ONE rule
 * the platform actually enforces (at least `minLength` characters, mirroring the server action)
 * as a requirement, and everything else as guidance with the reasoning attached. The counts below
 * are the honest version of "add a number and a symbol": they make a password longer to type, not
 * meaningfully harder to guess, which the copy says out loud.
 *
 * ACCESSIBILITY: the bar itself is decorative and `aria-hidden`, because a screen reader gains
 * nothing from four empty divs. The information is in the sentence, which is a polite live region
 * so it is announced when it changes without interrupting what is being typed.
 */
function PasswordStrength({ id, value, minLength }: { id: string; value: string; minLength: number }) {
  const hasLength = value.length >= minLength;
  const classes = countClasses(value);
  const label = !value ? 'Waiting for input' : !hasLength ? 'Too short' : strengthLabel(classes);

  return (
    <div className="mt-2">
      <div aria-hidden="true" className="flex gap-1">
        {[0, 1, 2, 3].map((step) => (
          <span
            key={step}
            className={`h-1 flex-1 rounded-full transition-colors ${
              value && step < classes
                ? classes >= 4
                  ? 'bg-emerald-500'
                  : classes >= 3
                    ? 'bg-secondary'
                    : 'bg-amber-300'
                : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      <p id={id} role="status" aria-live="polite" className="mt-2 text-xs leading-relaxed text-slate-600">
        <span className="font-semibold text-slate-900">{label}</span>
        {value ? (
          <>
            {' '}
            — {value.length} character{value.length === 1 ? '' : 's'}. The platform requires{' '}
            {minLength} or more.
          </>
        ) : (
          <> — the platform requires {minLength} characters or more.</>
        )}
      </p>

      <details className="mt-1.5">
        <summary className="cursor-pointer font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          What actually helps
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
          <li>
            Length is the part that matters. Three unrelated words are stronger — and easier to
            remember — than one word with a capital letter and a symbol bolted on.
          </li>
          <li>
            A password manager is a better answer than a pattern you can reconstruct. Nothing on
            this platform ever shows you a password again.
          </li>
          <li>
            Above {minLength} characters this meter will say so; that is a threshold, not a
            verdict. It cannot tell a passphrase from a keyboard walk, and it does not claim to.
          </li>
        </ul>
      </details>
    </div>
  );
}

/** Coarse buckets. Deliberately not a score out of 100 — that would imply precision that is absent. */
function countClasses(value: string): number {
  if (!value) return 0;
  let score = value.length >= 10 ? 1 : 0;
  if (value.length >= 14) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(score, 4);
}

function strengthLabel(classes: number): string {
  if (classes >= 4) return 'Long';
  if (classes === 3) return 'Reasonable';
  if (classes === 2) return 'Long enough';
  return 'Weak';
}

/**
 * The submit button, with the pending state the brief asks for.
 *
 * `useFormStatus` reads the state of the nearest enclosing form, so this has to be rendered INSIDE
 * the form — which is why it is a component rather than a class applied to a plain button.
 *
 * `disabled` and `aria-busy` are both set, and they do different jobs: `disabled` stops the second
 * click of a double submit (which, on a sign-up form, can otherwise create two accounts), and
 * `aria-busy` tells assistive technology that the wait is expected rather than a stalled page.
 * The spinner is `aria-hidden` because the button's own label already says what is happening, and
 * `motion-reduce:animate-none` keeps it still for anyone who has asked for less motion — the text
 * change is what carries the meaning.
 */
export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  /** Shown while the action is in flight. Say what is happening, not "Loading". */
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={AUTH_CTA}>
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-solid border-primary-deep/30 border-t-primary-deep motion-reduce:animate-none"
          />
          {pendingLabel}
        </>
      ) : (
        <>
          {children}
          <span aria-hidden="true">→</span>
        </>
      )}
    </button>
  );
}

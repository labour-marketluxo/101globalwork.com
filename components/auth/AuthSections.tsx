import Link from 'next/link';
import type { ReactNode } from 'react';
import { CircleCheck, Info, TriangleAlert } from '@/components/ui/icons';
import { FIELD, LABEL } from '@/components/discovery/tokens';
import { signInWithGoogleAction } from '@/features/auth/actions';

/**
 * The authentication card — one shell, one control vocabulary, five pages.
 *
 * WHY IT IS SHARED RATHER THAN PER-PAGE. /auth/sign-in, /auth/sign-up, /auth/recovery,
 * /auth/verify and /auth/challenge are the same object: a centred card with a heading, a lede,
 * a stack of fields and a footer link. They were five copies of the same class strings before,
 * spread across the (auth) group, and the copies had already drifted — one used `.notice` for
 * both errors and confirmations, another used it for neither.
 *
 * THE OLD CLASSES ARE DELIBERATELY NOT USED. `.content-shell`, `.auth-shell`, `.stack-form`,
 * `.notice` and `.secondary-button` all live in app/entry-points.css, which is UNLAYERED — so
 * they outrank every Tailwind utility and cannot be restyled. Building on them is what made the
 * previous pages impossible to bring onto the brand, so the shell here is utilities only. The
 * fields and labels come from the same tokens the discovery surfaces use (FIELD, LABEL), while
 * the card has its OWN constant — AUTH_CARD below — because this shell wants a softer, roomier
 * container than the discovery surfaces' shared CARD token, and changing that token would have
 * restyled every taxonomy card on the public site. One consequence worth
 * knowing: `.stack-form input` sets `font: inherit`, so the controls render at the inherited
 * weight unless `font-normal` is present — which FIELD already carries.
 *
 * THE CTA IS AMBER WITH DEEP TEAL TEXT, NOT WHITE.
 *
 * This is a deliberate departure from the navbar CTA, which reproduces the design's own white
 * on amber (~3.2:1 — under AA at 14px, and documented as such in AuthNav.tsx). On a sign-in
 * page the cost of getting this wrong is higher than in the chrome: the button sits under a
 * password field and next to error states, and the amber fill with dark teal on top measures
 * ~5.8:1. The brand colour of every primary action is unchanged; only the label ink is.
 */

/** Full-width primary action. `disabled:` covers the pending state the submit button renders. */
export const AUTH_CTA =
  'inline-flex w-full items-center justify-center gap-2 rounded-lg border-0 bg-secondary px-5 py-3 font-sans text-sm font-bold tracking-wide text-primary-deep uppercase shadow-sm transition-colors hover:bg-amber-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:opacity-70';

/** Full-width secondary action (the social provider button). */
export const AUTH_CTA_SECONDARY =
  'inline-flex w-full items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-solid border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-primary hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70';

/** Inline link. Preflight is not imported, so underlines and colour are both explicit. */
export const AUTH_LINK = 'font-semibold text-primary underline underline-offset-2 hover:text-primary-dark';

/**
 * An inline action that is a `<button>`, not a `<Link>` — same look as AUTH_LINK, none of the native
 * chrome.
 *
 * ⚠️ `border-0 bg-transparent p-0` ARE THE POINT OF THIS CONSTANT, not decoration. Tailwind's Preflight
 * is not imported in this project, so a bare `<button>` keeps the user agent's `2px outset` border, its
 * `ButtonFace` background and its `1px 6px` padding. Colour and underline utilities do not touch any of
 * those, so a "text link" button renders as a small grey native button wearing an underline. That is
 * exactly what happened to the decline, resend and "try another method" buttons: they looked correct in
 * the markup and wrong on screen. AUTH_CTA has always carried `border-0` for the same reason — this is
 * that reset, for the buttons that are not full-width CTAs.
 */
export const AUTH_TEXT_BUTTON =
  'cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-primary underline underline-offset-2 transition-colors hover:text-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline';

/**
 * The card every credential screen sits in.
 *
 * Its own constant rather than the shared CARD token from components/discovery/tokens.ts: this
 * container is deliberately softer (16px rather than 12px) and flatter, because it holds a form
 * rather than a grid of results, and reusing CARD would have meant either restyling every
 * discovery card or overriding this one in five places.
 *
 * `border-solid` is explicit because Preflight is not imported — Tailwind's `border` utility
 * sets the width only, and a bare <div> with `border` and no `border-solid` keeps the browser's
 * default border STYLE, which is `none` for a div.
 */
const AUTH_CARD = 'w-full rounded-2xl border border-solid border-slate-200 bg-white shadow-sm';

const NOTICE_TONES = {
  error: 'border-secondary bg-secondary-light text-amber-900',
  info: 'border-primary bg-primary-surface text-primary',
  success: 'border-emerald-500 bg-emerald-50 text-emerald-900',
} as const;

const NOTICE_ICONS = {
  error: TriangleAlert,
  info: Info,
  success: CircleCheck,
} as const;

/**
 * The card's frame: eyebrow, heading, lede, then whatever the page needs.
 *
 * `max-w-md` and `mx-auto` are the brief's layout, and the padding is stepped so the card keeps
 * comfortable gutters at 320px without leaving a wide gap on a phone — `px-4 py-10` at the
 * smallest, `sm:px-6 sm:py-14` above it.
 */
export function AuthShell({
  eyebrow,
  title,
  lede,
  notice,
  children,
  footer,
  aside,
  /** Optional node rendered above the card. */
  back,
  /**
   * Moves the eyebrow and title inside the card, above the page's own children. Sign-in and
   * sign-up use this; the other credential screens keep their heading above the card.
   */
  insideCard = false,
  size = 'md',
}: {
  eyebrow: string;
  /** Rendered as an h1 — exactly one per page. */
  title: string;
  /** Optional: the sign-in and sign-up cards no longer carry one. */
  lede?: string;
  /** Error or status callout, above the form — or inside it in `insideCard` mode. */
  notice?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  aside?: ReactNode;
  back?: ReactNode;
  insideCard?: boolean;
  /**
   * `md` is the sign-in card. `lg` is for a page that has to explain something before asking for a
   * decision — the invitation, where role, inviter, permissions and expiry all belong above the
   * buttons. Same card, more room; a second shell would be a second thing to keep in step.
   */
  size?: 'md' | 'lg';
}) {
  return (
    <div className={`flex w-full flex-col ${size === 'lg' ? 'max-w-xl' : 'max-w-md'}`}>
      {back}

      {/* The default shape keeps the heading on the canvas; sign-in and sign-up opt into the
          in-card shape so the card opens with its own badge and title. */}
      {insideCard ? null : (
        <>
          <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            {title}
          </h1>
          {lede ? <p className="mt-2 text-sm leading-relaxed text-slate-600">{lede}</p> : null}
        </>
      )}

      {insideCard ? null : notice ? <div className="mt-5">{notice}</div> : null}

      <div className={`${AUTH_CARD} ${insideCard ? 'flex flex-col p-8' : 'mt-6 p-6 sm:p-8'}`}>
        {insideCard ? (
          <>
            <p className="mb-1 text-sm text-slate-500">{eyebrow}</p>
            <h1 className="mb-6 text-2xl font-bold text-slate-900">{title}</h1>
            {lede ? <p className="mb-6 text-sm leading-relaxed text-slate-600">{lede}</p> : null}
            {notice ? <div className="mb-6">{notice}</div> : null}
          </>
        ) : null}
        {children}
      </div>

      {aside ? <div className="mt-4">{aside}</div> : null}
      {footer ? <div className="mt-6 text-sm text-slate-600">{footer}</div> : null}
    </div>
  );
}

/**
 * An error or status callout.
 *
 * `role` and `aria-live` are not decoration: the form submits to a server action and the page
 * re-renders with the outcome, so without a live region a screen-reader user gets no
 * announcement that their attempt failed — the error simply appears above the field they have
 * already left. `error` uses `role="alert"` (assertive), the others `role="status"` (polite).
 */
export function AuthNotice({
  tone = 'error',
  title,
  children,
}: {
  tone?: keyof typeof NOTICE_TONES;
  /** Optional bold first line. Keep it short — it is the part that gets read aloud. */
  title?: string;
  children: ReactNode;
}) {
  const Icon = NOTICE_ICONS[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`flex gap-3 rounded-lg border-l-4 border-solid px-4 py-3 text-sm leading-relaxed ${NOTICE_TONES[tone]}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {title ? <p className="font-bold">{title}</p> : null}
        <div className={title ? 'mt-1' : undefined}>{children}</div>
      </div>
    </div>
  );
}

/** A labelled field. The hint and the error both hang off `aria-describedby` at the call site. */
export function AuthField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  /** Rendered under the control and wired up by the caller via describedBy. */
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The input itself, so every text field on every auth page is the same control. */
export function AuthInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${FIELD} ${props.className ?? ''}`} />;
}

/** `or` between the social button and the password form. */
export function AuthDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-slate-200" />
      <span className="font-sans text-[11px] font-bold tracking-wider text-slate-400 uppercase">
        {label}
      </span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

/**
 * Google sign-in.
 *
 * IT IS A FORM, NOT A FETCH. The whole flow is a server action that issues the provider redirect,
 * so it needs no client JavaScript and works with the same progressive-enhancement story as the
 * password form beside it. The destination rides along in a hidden field, so a visitor who
 * arrived from /ng/lagos/ikeja/plumbers still lands there.
 *
 * GOOGLE IS THE ONLY PROVIDER RENDERED. The brief asks for "Google/Apple if configured": Apple
 * is not configured on this project, and a button that cannot complete — because the provider
 * has no client id, no key and no verified domain — is worse than no button at all. The
 * explanatory sentence that used to sit under the button was removed at the brief's request.
 * Adding Apple is a provider change in the Supabase project plus an action, not a second button
 * here.
 */
export function SocialAuth({ destination }: { destination: string }) {
  return (
    <form action={signInWithGoogleAction}>
      <input type="hidden" name="next" value={destination} />
      <button type="submit" className={AUTH_CTA_SECONDARY}>
        <GoogleMark />
        Continue with Google
      </button>
    </form>
  );
}

/** The Google mark, inline so it costs no request and needs no icon package. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * The consent line.
 *
 * Two separate links rather than one, because the two documents are different agreements, and
 * they point at /legal/terms and /legal/privacy — which today render as "not in force", with the
 * reason stated on the page. The explanatory line under the checkbox was removed at the brief's
 * request; the links still open the current drafts, and the checkbox copy still asks the visitor
 * to confirm they have read them.
 */
export function ConsentField() {
  return (
    <div className="flex gap-3">
      <input
        id="consent"
        name="consent"
        type="checkbox"
        required
        className="mt-0.5 h-4 w-4 shrink-0 accent-secondary"
      />
      <label htmlFor="consent" className="text-xs leading-relaxed text-slate-700">
        I have read the{' '}
        <Link href="/legal/terms" className={AUTH_LINK}>
          Terms of Service
        </Link>{' '}
        and the{' '}
        <Link href="/legal/privacy" className={AUTH_LINK}>
          Privacy Policy
        </Link>
        , and I understand how this platform handles my work and my data.
      </label>
    </div>
  );
}

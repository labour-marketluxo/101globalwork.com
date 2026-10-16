import type { ReactNode } from 'react';

/**
 * WorkspaceHero — the dark-teal banner the workspace pages open with.
 *
 * ONE COMPONENT, EVERY SIGNED-IN SURFACE. It began on the customer side, where Dashboard, My requests,
 * Bookings, Payments and Assets all opened with a plain white heading that read as "an unfinished
 * interior page". The provider sections had the same problem — five slightly different white headings
 * on the same rail — so the band is shared rather than owned by either view, and the account screens
 * use it too (see components/account/AccountHero.tsx).
 *
 * `eyebrow` is the small amber line above the title, `description` the supporting sentence, and
 * anything passed as `children` renders under both — the dashboard's one-field request form, the
 * "Post a Request" action on the requests list, or a page's status chip.
 *
 * ⚠️ `font-sans`, NOT `font-mono`. Briefs for this band spell the eyebrow in monospace, but this app
 * has no monospace face at all — `--font-mono` is set to `initial` in globals.css and the rule there
 * says the utility "should not exist to be reached for". The classes keep the rest of those briefs
 * (size, weight, tracking, uppercase, colour) on the same face as every other small label.
 */
export const WORKSPACE_HERO_ACTION =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#F59E0B] px-6 py-3.5 font-sans text-xs font-bold text-slate-950 no-underline shadow-md transition-all hover:bg-[#D97706] active:scale-95';

export const WORKSPACE_HERO_INPUT =
  'w-full flex-1 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-slate-400 focus:border-amber-400 focus:bg-white/20';

export default function WorkspaceHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Rendered under the description — a form, an action, a status chip, or nothing at all. */
  children?: ReactNode;
}) {
  return (
    <section className="mb-8 rounded-2xl border border-slate-800/50 bg-[#0D282E] p-8 text-white shadow-md md:p-10">
      {eyebrow ? (
        <p className="mb-2 font-sans text-xs font-bold tracking-wider text-amber-400 uppercase">{eyebrow}</p>
      ) : null}

      {/* ⚠️ THE SPACE BEFORE `${` IS LOAD-BEARING. Tailwind's scanner reads a candidate up to the first
          character it cannot use in a class name, and `$` is one it accepts — so `md:text-3xl${on ? … }`
          yields the candidate `md:text-3xl${description`, which is not a utility, and the class is never
          emitted. This title silently stayed at 24px on every screen until it was measured; the space ends
          the candidate cleanly. Verified by compiling this file through the project's own Tailwind. */}
      <h1 className={`text-2xl font-bold tracking-tight text-white md:text-3xl ${description || children ? 'mb-3' : ''}`}>
        {title}
      </h1>

      {description ? (
        <p className={`max-w-2xl text-sm leading-relaxed text-slate-300 ${children ? 'mb-6' : ''}`}>
          {description}
        </p>
      ) : null}

      {children}
    </section>
  );
}

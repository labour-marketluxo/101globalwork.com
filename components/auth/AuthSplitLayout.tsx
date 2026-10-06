import Image from 'next/image';
import Link from 'next/link';

/**
 * AuthSplitLayout — the 65/35 split for /auth/sign-in and /auth/sign-up.
 *
 * WHY THESE TWO ROUTES LEFT THE (minimal-auth) GROUP. The minimal chrome is a logo-only bar above a
 * centred card, and a nested layout can add to its parent but never remove it. A split screen that
 * also carried that bar would render two brand headers stacked on top of each other, so these two
 * routes moved to their own group ((auth-split)) with this layout instead. Verify, recovery,
 * challenge, onboarding and the invitation keep the minimal chrome and are unchanged.
 *
 * THE HEADER IS THE LOGO ALONE AND THERE IS NO FOOTER. The way back to the site is the logo itself;
 * the header link and the footnote strip that were here have both been removed, at the brief's
 * request. Deleting the footer also means the left column no longer needs `justify-between` — the
 * header sits at the top and the form centres in the space under it.
 *
 * NO NESTED SCROLLBAR, AND THE PANEL STILL DOESN'T MOVE. The page scrolls as a normal document:
 * there is no `overflow-y-auto` region inside the form column, so no scrollbar appears beside the
 * card and the wheel/trackpad gesture is not captured by a nested scroller. To keep the earlier
 * requirement that the visual panel does not scroll away, the panel itself is
 * `lg:sticky lg:top-0 lg:h-[100dvh] lg:self-start` — the document scrolls, the panel stays put.
 * `self-start` is required or the grid would stretch the panel to the row height and sticky would
 * have nothing to move against, and the grid deliberately carries no `overflow-hidden` because an
 * overflow ancestor turns sticky into a no-op.
 *
 * THE COLUMNS ARE EXACTLY 65/35. Two columns (`grid-cols-[65fr_35fr]`) rather than twelve, because
 * 65 and 35 do not land on whole twelfths and `col-span-8` would silently be 66.7/33.3.
 *
 * THE RIGHT PANEL IS DECORATIVE. Its image carries `alt=""` because it conveys nothing a screen
 * reader needs — the glass card in front of it is the content. The card is pushed to the bottom
 * with `mt-auto` and is `w-full`, so it spans the panel minus the panel's own padding rather than
 * sitting as a narrow block on its left edge.
 *
 * THE OVERLAY COPY DELIBERATELY AVOIDS "ESCROW" AND "GUARANTEED". The brief asked for "escrow
 * protection" and "[ GUARANTEED MILESTONES ]". This platform publishes the opposite position in
 * three places — /trust-and-safety ("A payment hold is not escrow", "No, and this page will not
 * call it that", "It is not a guarantee …"), features/legal/policies.ts, and the landing-page
 * note in RoutePreviews.tsx — because escrow is a specific legal arrangement with duties attached
 * to the holder and the money is held by the payment provider, not by 101GlobalWork. The card
 * therefore says what actually happens: milestones are released on approval.
 */
export default function AuthSplitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] w-full grid-cols-1 bg-slate-50 lg:grid-cols-[65fr_35fr]">
      {/* ── 65% — the form ─────────────────────────────────────────────────────────────── */}
      <main className="flex min-h-[100dvh] flex-col px-4 pt-3 pb-6 sm:px-8 sm:pt-4 sm:pb-10 md:px-10 md:pt-5 md:pb-14">
        <header className="mb-6 flex shrink-0 items-center">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-solid border-primary bg-primary font-sans text-[11px] font-bold text-white"
            >
              101
            </span>
            <span className="text-base font-bold tracking-tight text-primary sm:text-lg">
              101GlobalWork
            </span>
          </Link>
        </header>

        <div className="mx-auto my-auto w-full max-w-md py-6">{children}</div>
      </main>

      {/* ── 35% — the visual panel ─────────────────────────────────────────────────────── */}
      <div className="relative hidden flex-col overflow-hidden rounded-l-3xl bg-[#0D282E] p-6 shadow-2xl lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:self-start xl:p-8">
        <div className="absolute inset-0 z-0 h-full w-full">
          <Image
            src="/images/auth/authImage.jpg"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 35vw, 100vw"
            className="object-cover opacity-50 mix-blend-overlay"
          />
        </div>
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#0D282E] via-[#0D282E]/40 to-transparent" />

        <div className="relative z-20 mt-auto w-full rounded-2xl border border-emerald-500/20 bg-white/10 p-6 shadow-xl backdrop-blur-md xl:p-8">
          <p className="mb-3 w-fit rounded-full border border-emerald-800/60 bg-emerald-950/80 px-3 py-1 font-sans text-xs text-emerald-400">
            MILESTONES ON APPROVAL
          </p>
          <p className="mb-3 text-base font-medium leading-relaxed text-slate-100">
            &ldquo;Itemized quotes, scope-first matching, and payment held by the provider until you
            approve the work — all in one workspace.&rdquo;
          </p>
          <p className="font-sans text-xs text-amber-400">101GlobalWork Platform</p>
        </div>
      </div>
    </div>
  );
}

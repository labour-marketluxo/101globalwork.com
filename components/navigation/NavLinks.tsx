'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';

/**
 * NavLinks / MobileNav — the header's links, active states and mobile drawer.
 *
 * WHY THIS IS A SEPARATE CLIENT FILE
 *
 * Active state needs `usePathname()`, which only works in a client component.
 * It deliberately does NOT make the whole header client: MainNav stays a server
 * component and so does AuthNav, which is `async` and reads the Supabase session
 * on every request. Only the two small pieces that need route awareness —
 * the link list and the drawer — cross the boundary. `usePathname` does not cause
 * a server round-trip for these pages, because they already render per request.
 *
 * WHAT CHANGED
 *
 * The links were server-rendered with no notion of where you are, and there was
 * no mobile navigation at all: below `lg` the list simply disappeared and the
 * only way to reach those pages on a phone was the footer. Now the same four
 * links appear in the bar from `lg` up and in the drawer below it, both driven
 * from one list, both marking the current route.
 *
 * ACTIVE STATE: an amber `::after` bar under the current route, plus white text.
 * Two details matter here:
 *
 *   1. `after:content-['']` is MANDATORY. Preflight is not imported in this
 *      project, so Tailwind's `::before/::after { content: '' }` reset does not
 *      exist and an `after:` utility with no content renders nothing at all — the
 *      indicator simply would not appear, with no error anywhere.
 *   2. Every link carries the SAME weight (`font-medium`) whether active or not.
 *      Weight is what makes adjacent items jump: a medium active link is a couple
 *      of pixels wider than its neighbours, so the row reflows on every route
 *      change. Colour and the indicator say which route you are on; weight no
 *      longer has to, and nothing moves.
 *
 * Hover is amber-tinted rather than white (`hover:text-amber-400`) and never
 * changes weight, for the same reason.
 *
 * VERIFYING HOVER: hover states cannot be checked in this project's automated
 * browser session. The integrated browser panel keeps the page HIDDEN
 * (`document.visibilityState === 'hidden'`), so requestAnimationFrame never fires,
 * Playwright's clicks and element screenshots time out waiting for the element to
 * be "stable", `page.keyboard` delivers nothing to the page, and reads of
 * hover-state computed styles come back inconsistent between runs. What CAN be
 * verified without a pointer — and is — is everything static: the rules existing
 * in the served CSS, in the utilities layer, inside `@media (hover: hover)`,
 * ordered after the base rules and at higher specificity. Hover appearance itself
 * needs a real browser with a mouse.
 *
 * ROUTE MATCHING is exact, with a trailing slash normalised away, so `/services/`
 * still marks `/services`. It is deliberately not a prefix match: `/services` must
 * not light up while you are on `/services/plumbing`.
 */

export const SECTION_LINKS = [
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/services', label: 'Services' },
  { href: '/trust-and-safety', label: 'Trust & Safety' },
  { href: '/pricing', label: 'Pricing' },
] as const;

/** Shared by every link so a route change can never move a neighbour. */
const LINK_BASE =
  'relative text-[14px] font-medium no-underline transition-colors duration-200';

const LINK_INACTIVE = 'text-slate-200 hover:text-amber-400';

const LINK_ACTIVE =
  "text-white after:absolute after:bottom-[-8px] after:left-0 after:h-[2px] after:w-full after:rounded-full after:bg-amber-400 after:content-['']";

function isActive(pathname: string, href: string): boolean {
  const normalise = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);
  return normalise(pathname) === normalise(href);
}

/** Desktop link group. Hidden below `lg`, where MobileNav takes over. */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections" className="hidden items-center gap-8 lg:flex">
      {SECTION_LINKS.map((link) => {
        const active = isActive(pathname, link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`${LINK_BASE} ${active ? LINK_ACTIVE : LINK_INACTIVE}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * MobileNav — hamburger plus a drawer panel under the bar.
 *
 * The panel is rendered only while open rather than being hidden with CSS. A
 * `hidden` panel keeps its links in the tab order and in the accessibility tree,
 * so a keyboard user would tab into a menu they cannot see; unmounting it avoids
 * that entirely and keeps one landmark label on the page at a time.
 *
 * Closing is handled by the two things users actually do — tapping a link, or
 * pressing Escape — with a body scroll lock while the panel is open so the page
 * behind it does not scroll away. There is deliberately no "close on route
 * change" effect: an effect that watches the pathname to call setState is exactly
 * the cascading render the lint config rejects, and the link's own onClick
 * already covers the case.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-solid border-white/20 text-white transition-colors hover:bg-white/10"
      >
        {open ? (
          <X aria-hidden="true" className="h-5 w-5" />
        ) : (
          <Menu aria-hidden="true" className="h-5 w-5" />
        )}
      </button>

      {open ? (
        <div
          id="mobile-nav"
          className="absolute inset-x-0 top-full border-t border-solid border-white/10 bg-primary shadow-2xl"
        >
          <nav aria-label="Sections" className="mx-auto w-full max-w-[1536px] px-4 py-4 sm:px-6">
            <ul className="grid gap-1">
              {SECTION_LINKS.map((link) => {
                const active = isActive(pathname, link.href);

                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={close}
                      aria-current={active ? 'page' : undefined}
                      className={`block rounded-lg px-3 py-2.5 text-sm font-medium no-underline transition-colors duration-200 ${
                        active
                          ? 'border-l-2 border-solid border-amber-400 bg-white/10 text-white'
                          : 'text-slate-200 hover:bg-white/5 hover:text-amber-400'
                      }`}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 grid gap-2 border-t border-solid border-white/10 pt-3">
              <Link
                href="/sign-in"
                onClick={close}
                className="inline-flex items-center justify-center rounded-lg border-[1.5px] border-solid border-amber-500 bg-transparent px-4 py-2.5 text-sm font-semibold text-amber-500 no-underline transition-all duration-200 hover:bg-amber-500 hover:text-white"
              >
                Sign In
              </Link>
              <Link
                href="/sign-in"
                onClick={close}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2.5 font-mono text-sm font-bold text-white no-underline shadow-lg shadow-amber-950/20 transition-all hover:bg-secondary-dark active:scale-95"
              >
                Post a Request
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}

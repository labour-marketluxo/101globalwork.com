'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Briefcase, Eye, UserRound } from '@/components/ui/icons';

/**
 * CustomerWorkspaceNav — the customer workspace's own header: the primary nav bar, then the
 * breadcrumb strip directly beneath it.
 *
 * WHY A CLIENT COMPONENT. Marking the current link and naming the current crumb both need the
 * pathname, and a server layout receives `params`, not the URL. Only these two small rows cross the
 * boundary; the layout itself stays a server component and keeps reading the session.
 *
 * TWO ROWS, WITH AIR BETWEEN THEM. The nav carries the white bar and its bottom rule; the breadcrumb
 * strip follows with `mt-6`, so the trail sits lower instead of being pinned to the nav's underside.
 * Both use the same horizontal padding as the content shell below them, so their first item lines up
 * with the page underneath.
 *
 * ACTIVE STATE: colour, weight and an underline, matched by LONGEST PREFIX. `/customer/requests/new`
 * is a child of `/customer/requests`, and a plain prefix test would light up both "My requests" and
 * "New request"; the longest matching href therefore wins. The `/customer` entry is the one exact
 * match, or it would mark itself on every page in the workspace.
 *
 * ONE UNDERLINE THAT TRAVELS. The active marker is a single absolutely-positioned bar, not an
 * `::after` on each link. That would only ever fade in and out; a shared bar can be measured under
 * the active link and animated to the next one, so a route change reads as the underline sliding
 * across the bar rather than blinking. `left`/`width` come from the link's own box in a layout
 * effect (before paint, so there is no first-frame jump), and the CSS transition does the movement.
 * It is re-measured on resize and after the fonts settle, because a `display: swap` face changes the
 * label widths a frame after first paint.
 *
 * ⚠️ THE NAV IS STICKY, AND THE HEADER IS A FRAGMENT FOR THAT REASON. `position: sticky` only holds
 * while its containing block is on screen, and the header's own wrapper would be ~96px tall; returning
 * a fragment puts the nav directly under `<main>`, whose box spans the whole page, so it stays pinned.
 * Nothing needs a spacer: a sticky element keeps its place in flow, so the breadcrumb and content do
 * not jump the way they would under `position: fixed`.
 *
 * ⚠️ THE "Customer / Provider" SWITCHER IS A VIEW SWITCHER, NOT NAVIGATION. It marks the active view
 * with `aria-current="true"` (generic, not "page") so it can never be confused with the page-level
 * `aria-current="page"` on the nav link above it.
 *
 * ⚠️ THE ICONS COME FROM components/ui/icons.tsx, WHICH IS ICONIFY. That module renders the bundled
 * `@iconify-icons/lucide` data through `@iconify/react/offline`, so an icon stays a server-safe svg
 * with no network fetch. The brief names the `ph:`/`iconamoon:` sets, which are not installed — adding
 * them would mean a new dependency and a bundled icon set for two glyphs — so the equivalent lucide
 * `UserRound` and `Briefcase` are used instead.
 */
type NavItem = { href: string; label: string };

const NAV: NavItem[] = [
  { href: '/customer', label: 'Dashboard' },
  { href: '/customer/requests', label: 'My requests' },
  { href: '/customer/bookings', label: 'Bookings' },
  { href: '/customer/payments', label: 'Payments' },
  { href: '/customer/assets', label: 'Assets' },
  { href: '/customer/requests/new', label: 'New request' },
];

function matches(pathname: string, href: string): boolean {
  if (href === '/customer') return pathname === '/customer';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * `useLayoutEffect` warns when it runs during a server render, and a client component is still
 * SSR'd. Fall back to `useEffect` on the server, measure before paint in the browser.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function CustomerWorkspaceNav({
  displayName,
  initials,
}: {
  displayName: string | null;
  initials: string;
}) {
  const pathname = usePathname();

  const active =
    NAV.filter(item => matches(pathname, item.href)).sort((a, b) => b.href.length - a.href.length)[0] ??
    null;

  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const measureIndicator = useCallback(() => {
    const el = active ? linkRefs.current.get(active.href) : null;
    setIndicator(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [active]);

  useIsomorphicLayoutEffect(() => {
    measureIndicator();
  }, [measureIndicator]);

  useEffect(() => {
    const remeasure = () => measureIndicator();
    window.addEventListener('resize', remeasure);
    document.fonts.ready.then(remeasure).catch(() => {});
    return () => window.removeEventListener('resize', remeasure);
  }, [measureIndicator]);

  const crumbs: { label: string; href?: string }[] = [
    { label: 'Home', href: '/' },
    {
      label: 'Customer workspace',
      href: active && active.href !== '/customer' ? '/customer' : undefined,
    },
  ];
  if (active && active.href !== '/customer') crumbs.push({ label: active.label });

  return (
    <>
      <nav aria-label="Customer workspace" className="sticky top-0 z-30 border-b border-slate-200/80 bg-white shadow-sm">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="relative flex h-full min-w-0 items-center gap-6 overflow-x-auto">
            {NAV.map(item => {
              const isCurrent = active?.href === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  ref={el => {
                    if (el) linkRefs.current.set(item.href, el);
                    else linkRefs.current.delete(item.href);
                  }}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`relative inline-flex h-full shrink-0 items-center py-4 text-sm no-underline transition-colors ${
                    isCurrent
                      ? 'font-bold text-slate-900'
                      : 'font-medium text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {indicator ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 left-0 h-[2px] rounded-full bg-[#0D282E] transition-[transform,width] duration-300 ease-out motion-reduce:transition-none"
                style={{
                  transform: `translateX(${indicator.left}px)`,
                  width: `${indicator.width}px`,
                }}
              />
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <nav
              aria-label="Workspace view"
              className="hidden items-center gap-1 rounded-lg border border-slate-200/60 bg-slate-100/80 p-1 shadow-xs sm:inline-flex"
            >
              <span className="flex select-none items-center px-2 text-slate-400" title="View">
                <Eye aria-hidden="true" className="h-4 w-4" />
                <span className="sr-only">View</span>
              </span>

              <Link
                href="/customer"
                aria-current="true"
                className="relative inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#0D282E] px-3.5 py-1.5 text-xs font-semibold text-white no-underline shadow-xs transition-all duration-200 select-none"
              >
                <UserRound aria-hidden="true" className="h-4 w-4 text-[#F59E0B]" />
                Customer
              </Link>

              <Link
                href="/provider"
                className="relative inline-flex cursor-pointer items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold text-slate-600 no-underline transition-all duration-200 select-none hover:bg-slate-200/50 hover:text-slate-900"
              >
                <Briefcase aria-hidden="true" className="h-4 w-4" />
                Provider
              </Link>
            </nav>

            <span
              aria-hidden="true"
              title={displayName ?? undefined}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-800/40 bg-[#0D282E] font-sans text-xs font-bold text-[#F59E0B] shadow-xs transition-all hover:border-amber-500/50"
            >
              {initials}
            </span>
            <span className="sr-only">Signed in as {displayName ?? 'this account'}</span>
          </div>
        </div>
      </nav>

      <div className="mt-6 flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 text-xs font-medium text-slate-500 sm:px-6 lg:px-8">
        {crumbs.map((crumb, index) => (
          <Fragment key={`${crumb.label}-${index}`}>
            {index > 0 ? (
              <span aria-hidden="true" className="font-light text-slate-300">
                /
              </span>
            ) : null}
            {crumb.href ? (
              <Link href={crumb.href} className="text-slate-500 no-underline transition-colors hover:text-slate-800">
                {crumb.label}
              </Link>
            ) : (
              <span
                aria-current={index === crumbs.length - 1 ? 'page' : undefined}
                className="font-semibold text-slate-900"
              >
                {crumb.label}
              </span>
            )}
          </Fragment>
        ))}
      </div>
    </>
  );
}

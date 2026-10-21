'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, Briefcase, ChevronDown, HardHat, LayoutGrid, Search, UserRound } from '@/components/ui/icons';
import AccountMenu from '@/components/workspace/AccountMenu';
import { MESSAGES_PATH, NOTIFICATIONS_PATH, PROFILE_PATH } from '@/features/settings/paths';
import { SUPPORT_PATH } from '@/features/support/paths';

/**
 * WorkspaceNavbar — the one top bar both signed-in workspaces share.
 *
 * WHY A CLIENT COMPONENT. Marking the current link, naming the current crumb, focusing the search
 * field from a shortcut and opening the switcher all need the pathname or local state, and a server
 * layout receives `params`, not the URL. The layouts stay server components and keep reading the
 * session; only this bar crosses the boundary.
 *
 * WHAT DIFFERS BETWEEN THE TWO VIEWS, AND WHAT DOES NOT. The bar itself — brand mark, search field,
 * workspace switcher, identity badge — is identical. What changes is the middle: the customer
 * workspace lists its sections across the bar, and the provider workspace deliberately does not,
 * because its sections already live in a full-height side rail and a second copy in the header would
 * be two menus disagreeing about where you are. The provider view also slots in one extra control,
 * its availability toggle, which is the status a field provider changes several times a day.
 *
 * FOUR ZONES, ONE ROW, SPREAD WITH `justify-between`: the brand mark, (the customer links), the search
 * bar, and the switcher plus the account menu. With no links, the provider bar is three zones; the
 * account bar is two, because it has neither links nor a search target.
 *
 * THE ACCOUNT VIEW IS NOT A THIRD WORKSPACE. `/app/account/notifications`, `/app/account/messages`, `/app/account/settings/*` and
 * `/app/account/support` belong to the person, not to either side of the business, so they get the same bar with
 * the section links dropped and the switcher relabelled "Workspaces" — where neither option is
 * current, because that panel is the way back to a workspace rather than a statement about where you
 * are. The initials badge is the menu that reaches them from anywhere: see AccountMenu.
 *
 * THE TRAIL STARTS AT THE WORKSPACE, AND THE ROOT HAS NONE. There is no "Home" crumb: the marketing
 * home is not this page's parent. `/app/customer` is the workspace's own root, so it renders no strip at
 * all — a one-item breadcrumb is just the page title in a smaller font. The provider workspace does
 * not use this strip at all; its trail is rendered inside its content column, above each page's title.
 *
 * ONE UNDERLINE THAT TRAVELS (customer view). The active marker is a single absolutely-positioned bar,
 * not an `::after` on each link. That could only ever fade in and out; a shared bar is measured under
 * the active link and animated to the next one, so a route change reads as the underline sliding
 * across the bar rather than blinking. It is re-measured on resize and after the fonts settle, because
 * a `display: swap` face changes the label widths a frame after first paint.
 *
 * ⚠️ THE BAR IS STICKY, AND THIS COMPONENT RETURNS A FRAGMENT FOR THAT REASON. `position: sticky` only
 * holds while its containing block is on screen, and a wrapper around the bar would be ~96px tall;
 * returning siblings puts the nav directly under `<main>`, whose box spans the whole page, so it stays
 * pinned. Nothing needs a spacer: a sticky element keeps its place in flow, so the breadcrumb and the
 * content do not jump the way they would under `position: fixed`.
 *
 * ⚠️ THE SWITCHER IS A VIEW SWITCHER, NOT NAVIGATION. It marks the active view with
 * `aria-current="true"` (generic, not "page") so it can never be confused with the page-level
 * `aria-current="page"` on a nav link.
 *
 * ⚠️ IT CARRIES ONE ENTRY THAT IS NOT A WORKSPACE, AND THAT IS THE POINT OF IT. `/app/projects/*` is a
 * shared destination belonging to neither side — intentionally a sibling of `/app/customer/*` and
 * `/app/provider/*` — so no section list owns it and this bar, which is the only chrome that appears on
 * every signed-in route outside the three sections, is the only place a link to it can live. Without the
 * entry a customer reached a project only from the completion review at the end of the job.
 *
 * ⚠️ WHICH ENTRY IS CURRENT IS DERIVED FROM THE PATHNAME, NOT HAND-MAINTAINED. The flag used to be written
 * into each list, which worked while every view could name its own workspace; a destination that belongs to
 * no view cannot, and a hardcoded "current" would have shown the wrong entry from `/app/projects/*`. The
 * account view is unchanged by the derivation: the pathname there is `/app/account/*`, which matches no
 * option, so none of them is marked — which is what that panel means.
 *
 * ⚠️ THE SAME ANSWER NAMES THE CLOSED TRIGGER. The button used to print the panel's own name ("Workspaces")
 * wherever a view had no better one, which left a project page labelled by its menu rather than by itself.
 *
 * ⚠️ THE ICONS COME FROM components/ui/icons.tsx, WHICH IS ICONIFY. That module renders the bundled
 * `@iconify-icons/lucide` data through `@iconify/react/offline`, so an icon stays a server-safe svg
 * with no network fetch. Briefs that name the `ph:` set are mapped onto the closest lucide glyph.
 */
/**
 * Which bar this is. `account` is not a workspace: it is the shell for `/app/account/notifications`, `/app/account/messages`,
 * `/app/account/settings/*` and `/app/account/support`, which belong to the signed-in person rather than to either side of
 * the business — same bar, no section links, and the switcher becomes a plain way back to a workspace.
 */
type WorkspaceView = 'customer' | 'provider' | 'account' | 'fallback';

/**
 * A link in the bar's horizontal list.
 *
 * `match` exists because one label can own a whole sub-tree: "Settings" is the section, but its link
 * goes straight to the profile tab, since `/app/account/settings` itself only redirects there.
 */
type NavItem = { href: string; label: string; match?: string };

const CUSTOMER_NAV: NavItem[] = [
  { href: '/app/customer', label: 'Dashboard' },
  { href: '/app/customer/requests', label: 'My requests' },
  { href: '/app/customer/bookings', label: 'Bookings' },
  { href: '/app/customer/payments', label: 'Payments' },
  { href: '/app/customer/assets', label: 'Assets' },
];

/**
 * THE BAR'S LIST ON THE ACCOUNT SCREENS, and the answer to "how do I get from Settings to Messages".
 *
 * The four account surfaces are siblings, so standing on one of them the bar should say the other
 * three exist. The alternative — leaving the avatar menu as the only route between them — makes
 * Settings and Support effectively invisible: the hero only carries the two surfaces that have a
 * count to show, so nothing on the page says the other two are there.
 *
 * It is not a second copy of the menu: the menu is the shortcut you can reach from a workspace, this
 * is the section's own navigation, and it is the same list the customer view gets.
 */
const ACCOUNT_NAV: NavItem[] = [
  { href: NOTIFICATIONS_PATH, label: 'Notifications' },
  { href: MESSAGES_PATH, label: 'Messages' },
  { href: SUPPORT_PATH, label: 'Support' },
  { href: PROFILE_PATH, label: 'Settings', match: '/app/account/settings' },
];

/**
 * The list each bar carries — the customer's sections, the account's four, or none at all (the
 * provider rail holds those, and the fallback bar has no section of its own).
 *
 * Module-level on purpose: picking the list inline would hand the component a new array every render,
 * and React Compiler's lint refuses to preserve the indicator's memoization when its dependency comes
 * from a value it cannot prove is stable.
 */
const NAV_BY_VIEW: Record<WorkspaceView, NavItem[]> = {
  customer: CUSTOMER_NAV,
  account: ACCOUNT_NAV,
  provider: [],
  fallback: [],
};

/**
 * Labels for customer sub-trees the nav does not link — `/app/customer/projects/*` is the only one today.
 * Without a label the trail would be "Customer workspace" alone, which marks the workspace root as the
 * current page from a project page, and it is not.
 */
const SECTION_FALLBACK: Record<string, string> = { projects: 'Projects' };

type ViewConfig = {
  navLabel: string;
  /** Absent on the account view: there is no workspace list for a query to narrow. */
  search?: { action: string; placeholder: string; id: string };
  switcherId: string;
  /** The closed trigger. */
  trigger: { label: string; icon: typeof UserRound };
  /** What the panel offers. Which one is marked comes from the pathname — see the note above `VIEWS`. */
  options: { href: string; label: string; icon: typeof UserRound }[];
};

const VIEWS: Record<WorkspaceView, ViewConfig> = {
  customer: {
    navLabel: 'Customer workspace',
    search: {
      action: '/app/customer/requests',
      placeholder: 'Search requests, bookings...',
      id: 'customer-workspace-search',
    },
    switcherId: 'customer-workspace-switcher',
    trigger: { label: 'Customer', icon: UserRound },
    options: [
      { href: '/app/customer', label: 'Customer', icon: UserRound },
      { href: '/app/provider', label: 'Provider', icon: HardHat },
      { href: '/app/projects', label: 'Projects', icon: Briefcase },
    ],
  },
  provider: {
    navLabel: 'Provider workspace',
    search: {
      action: '/app/provider/work',
      placeholder: 'Search jobs and quotes...',
      id: 'provider-workspace-search',
    },
    switcherId: 'provider-workspace-switcher',
    trigger: { label: 'Provider', icon: HardHat },
    options: [
      { href: '/app/provider', label: 'Provider', icon: HardHat },
      { href: '/app/customer', label: 'Customer', icon: UserRound },
      { href: '/app/projects', label: 'Projects', icon: Briefcase },
    ],
  },
  account: {
    navLabel: 'Account',
    // Same field as the customer bar: the account screens have no list of their own to narrow, and a
    // bar that loses its search when you open Settings is the "the navbar changed" complaint.
    search: {
      action: '/app/customer/requests',
      placeholder: 'Search requests, bookings...',
      id: 'account-workspace-search',
    },
    switcherId: 'account-workspace-switcher',
    // Nothing is "current" here — this panel is the way back out, not a statement about where you are.
    // Without it, /account/settings would be a page with no route out of it.
    trigger: { label: 'Workspaces', icon: LayoutGrid },
    options: [
      { href: '/app/customer', label: 'Customer workspace', icon: UserRound },
      { href: '/app/provider', label: 'Provider workspace', icon: HardHat },
      { href: '/app/projects', label: 'Projects', icon: Briefcase },
    ],
  },
  /**
   * The bar for signed-in routes that are not one of the three sections — /work, /requests/*,
   * /projects/*, /org/*, /programmes/*, /recurring. They used to have no chrome at all, which is the
   * "the navbar disappeared" half of the complaint: a rail-less page with no way back. The list is the
   * customer's, because that is the context these surfaces belong to.
   *
   * ⚠️ THE SWITCHER IS NOT NEUTRAL HERE ANY MORE, AND THE ONE MARKED ENTRY IS THE POINT. On `/app/projects/*`
   * it says "Projects", because that is the surface the visitor is actually on; on every other fallback route
   * — /work, /requests/*, /org/*, /programmes/*, /recurring — nothing is marked, because none of those is a
   * workspace. Keep that in mind when adding an entry: the mark is derived from the pathname, so an entry
   * whose href is a prefix of another's would light up for the wrong page.
   */
  fallback: {
    navLabel: 'Workspace',
    search: {
      action: '/app/customer/requests',
      placeholder: 'Search requests, bookings...',
      id: 'workspace-search',
    },
    switcherId: 'workspace-switcher',
    trigger: { label: 'Workspaces', icon: LayoutGrid },
    options: [
      { href: '/app/customer', label: 'Customer workspace', icon: UserRound },
      { href: '/app/provider', label: 'Provider workspace', icon: HardHat },
      { href: '/app/projects', label: 'Projects', icon: Briefcase },
    ],
  },
};

function matches(pathname: string, item: NavItem): boolean {
  const href = item.match ?? item.href;
  if (href === '/app/customer') return pathname === '/app/customer';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * `useLayoutEffect` warns when it runs during a server render, and a client component is still
 * SSR'd. Fall back to `useEffect` on the server, measure before paint in the browser.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function WorkspaceNavbar({
  view,
  displayName,
  initials,
  statusSlot,
}: {
  view: WorkspaceView;
  displayName: string | null;
  initials: string;
  /** The provider view's availability toggle. A slot, because it is a server-action form. */
  statusSlot?: ReactNode;
}) {
  const pathname = usePathname();
  const config = VIEWS[view];
  /**
   * The section links are hidden on the provider view only, and that is a deliberate exception the
   * provider rail already argued for: its nine sections live in a full-height sidebar, and a second
   * copy across the bar would be two menus disagreeing about where you are. Everywhere else — the
   * customer workspace, the account screens — the bar carries its own list and its search, so the
   * chrome does not change shape as you move around.
   */
  const links = NAV_BY_VIEW[view];
  const hasLinks = links.length > 0;

  // Longest match wins, and `reduce` rather than `filter().sort()` keeps it non-mutating: the compiler
  // treats a `.sort()` on a list derived from `links` as a possible mutation of `links` itself.
  const active = links.reduce<NavItem | null>((best, item) => {
    if (!matches(pathname, item)) return best;
    const length = (item.match ?? item.href).length;
    return !best || length > (best.match ?? best.href).length ? item : best;
  }, null);

  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const measureIndicator = useCallback(() => {
    const el = active ? linkRefs.current.get(active.href) : null;
    setIndicator(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [active]);

  useIsomorphicLayoutEffect(() => {
    if (!hasLinks) return;
    measureIndicator();
  }, [measureIndicator, hasLinks]);

  useEffect(() => {
    if (!hasLinks) return;
    const remeasure = () => measureIndicator();
    window.addEventListener('resize', remeasure);
    document.fonts.ready.then(remeasure).catch(() => {});
    return () => window.removeEventListener('resize', remeasure);
  }, [measureIndicator, hasLinks]);

  // The search field. Cmd/Ctrl+K focuses it.
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // The condensed workspace switcher. A disclosure, not an ARIA menu: the panel is a short list of
  // links, so arrow-key semantics would promise behaviour that is not implemented.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen]);

  // `/app/<section>/<leaf>` — index 0 is the empty string before the first slash, 1 is `app`, 2 is the
  // section, 3 is the leaf.
  const sectionSlug = pathname.split('/')[3] ?? '';
  const section =
    active && active.href !== '/app/customer' ? active.label : (SECTION_FALLBACK[sectionSlug] ?? null);

  /**
   * ⚠️ THE WIZARD IS NOT A SECTION, SO ITS TRAIL IS WRITTEN OUT. `/app/customer/requests/new` has no nav
   * entry any more — it is a leaf reached from "Post a Request" on the requests list — so the
   * longest-prefix match finds "My requests" and the trail spells the rest of the path by hand:
   * Customer workspace / My requests / New. Without this the wizard would read as if it were the
   * requests list itself.
   */
  const inNewRequest =
    pathname === '/app/customer/requests/new' || pathname.startsWith('/app/customer/requests/new/');

  // The strip is the customer's. The account screens render their own (`AccountBreadcrumbs`), and the
  // provider trail sits in its content column — so this is gated on the view, not on `showLinks`,
  // which is now true for the account bar too.
  const crumbs: { label: string; href?: string }[] = view !== 'customer'
    ? []
    : inNewRequest
      ? [
          { label: 'Customer workspace', href: '/app/customer' },
          { label: 'My requests', href: '/app/customer/requests' },
          { label: 'New' },
        ]
      : section
        ? [
            { label: 'Customer workspace', href: '/app/customer' },
            { label: section },
          ]
        : [];

  /**
   * The surface this URL belongs to, when the switcher has an entry for it.
   *
   * ⚠️ THE TRIGGER NAMES WHERE YOU ARE, NOT WHAT THE PANEL IS. On a project page the closed button read
   * "Workspaces" — the name of the panel — even though the visitor is on a surface the panel itself lists as
   * "Projects". The customer and provider bars have always named their surface ("Customer", "Provider"); this
   * gives every bar the same rule instead of one of them describing the menu. Where nothing matches — the
   * account screens, /work, /requests/*, /org/*, /programmes/*, /recurring — it still says "Workspaces",
   * because there the panel really is just the way back out.
   *
   * WHICH ENTRY IS MARKED, AND WHICH IS NAMED, ARE THE SAME ANSWER. `surface` feeds both, so the button can
   * never name one entry while the panel highlights another. Longest match wins, as with `active` above, so a
   * nested entry beats its parent if one is ever added.
   */
  const surface = config.options.reduce<ViewConfig['options'][number] | null>((best, option) => {
    const contains = pathname === option.href || pathname.startsWith(`${option.href}/`);
    if (!contains) return best;
    return !best || option.href.length > best.href.length ? option : best;
  }, null);

  const TriggerIcon = surface?.icon ?? config.trigger.icon;
  const triggerLabel = surface?.label ?? config.trigger.label;

  return (
    <>
      <nav aria-label={config.navLabel} className="sticky top-0 z-20 border-b border-slate-200/80 bg-white shadow-xs">
        <div className="flex h-16 items-center justify-between gap-4 px-6">
          <Link href="/" aria-label="101GlobalWork" className="flex shrink-0 items-center gap-2.5 no-underline">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0D282E] font-sans text-[11px] font-bold text-[#F59E0B]"
            >
              101
            </span>
            <span className="hidden text-base font-bold tracking-tight text-slate-900 xl:inline">
              101GlobalWork
            </span>
          </Link>

          {/*
            The list scrolls horizontally when the bar runs out of room — four zones (brand, links,
            search, controls) need roughly 1100px before anything has to give, and below that the links
            are the flex item that absorbs the squeeze.

            ⚠️ THE SCROLLBAR IS HIDDEN, AND NOT BECAUSE IT IS UNTIDY. A 15px scrollbar inside a 64px bar
            eats a quarter of its height and draws a grey rule through the middle of the header; the row
            stays swipeable and scroll-wheel scrollable without it. `scrollbar-width` covers Firefox, the
            `::-webkit-scrollbar` rule covers Chrome and Safari, and `-ms-overflow-style` covers old Edge.
          */}
          {links.length > 0 ? (
            <div className="relative flex h-full min-w-0 items-center gap-5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {links.map(item => {
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
          ) : null}

          {config.search ? (
            <form
              action={config.search.action}
              method="get"
              role="search"
              className="hidden min-w-0 shrink-0 md:block"
            >
              {/* Narrower than it was: the field is the one thing here nobody reads at rest, so it is
                  the first place to buy back room for the links. */}
              <div className="relative flex w-56 cursor-pointer items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-100/80 px-3.5 py-2 transition-all hover:bg-slate-100 focus-within:border-amber-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/25 lg:w-64">
                <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  ref={searchRef}
                  id={config.search.id}
                  name="q"
                  type="search"
                  placeholder={config.search.placeholder}
                  className="w-full border-none bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </form>
          ) : null}

          <div className="flex shrink-0 items-center gap-3">
            {statusSlot}

            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(open => !open)}
                aria-expanded={menuOpen}
                aria-controls={config.switcherId}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#0D282E] px-3 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:bg-primary-dark"
              >
                <TriggerIcon aria-hidden="true" className="h-4 w-4 text-[#F59E0B]" />
                {triggerLabel}
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-slate-300" />
              </button>

              {menuOpen ? (
                <div
                  id={config.switcherId}
                  className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-lg"
                >
                  <p className="px-2 py-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                    Switch workspace
                  </p>

                  <div className="grid gap-1">
                    {config.options.map(option => {
                      const OptionIcon = option.icon;
                      // Derived from the URL rather than declared in the list: one of these entries is a
                      // destination that belongs to no view, so the pathname is the only thing that can say
                      // which entry is current — see `surface` above, which the trigger also reads.
                      const isOptionCurrent = option.href === surface?.href;
                      return (
                        <Link
                          key={option.href}
                          href={option.href}
                          onClick={() => setMenuOpen(false)}
                          aria-current={isOptionCurrent ? 'true' : undefined}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 font-semibold no-underline transition-colors ${
                            isOptionCurrent
                              ? 'bg-[#0D282E] text-white shadow-xs'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <OptionIcon
                            aria-hidden="true"
                            className={`h-4 w-4 shrink-0 ${isOptionCurrent ? 'text-[#F59E0B]' : ''}`}
                          />
                          {option.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            {/* The bell sits between the two dropdowns: the left one switches workspace, the right
                one is the account. Notifications is the third thing people reach for, and until now
                it had no home in the bar at all — it was two clicks inside the avatar menu. */}
            <Link
              href={NOTIFICATIONS_PATH}
              aria-label="Notifications"
              aria-current={pathname === NOTIFICATIONS_PATH ? 'page' : undefined}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 transition-colors hover:bg-slate-50"
            >
              <Bell aria-hidden="true" className="h-[18px] w-[18px]" />
            </Link>

            <AccountMenu displayName={displayName} initials={initials} />
          </div>
        </div>
      </nav>

      {crumbs.length > 0 ? (
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
      ) : null}
    </>
  );
}

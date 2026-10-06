'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BadgeCheck,
  CalendarClock,
  ClipboardList,
  HardHat,
  Inbox,
  LayoutDashboard,
  PiggyBank,
  Search,
  ScrollText,
  UserRound,
} from '@/components/ui/icons';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * The provider workspace's navigation — a side rail on a laptop, a bottom bar on a phone.
 *
 * ⚠️ TWO RENDERINGS OF ONE LIST, NOT TWO LISTS. A bottom bar on a wide screen wastes the vertical
 * space a schedule needs, and a side rail on a phone is a drawer nobody opens with one hand on site;
 * both surfaces are the same `ITEMS` array rendered twice, so a new section cannot appear on one and
 * be missing from the other.
 *
 * ⚠️ THESE ARE LINKS, NOT `role="tab"`. Same reasoning as the settings bar: these are six URLs with
 * six documents, and the ARIA tabs pattern promises arrow-key switching between panels of one page.
 * `aria-current="page"` on a link is what a screen reader already knows how to read.
 *
 * A CLIENT COMPONENT because the current item is decided by the URL, and a server layout receives
 * params rather than pathname. It holds no state: the only thing it reads is the path.
 */

type Item = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Prefixes that should also mark this item current — a detail page belonging to a section. */
  also?: string[];
  /** Only rendered when `showSetup` — the workspace keeps the setup flow out of the way otherwise. */
  setup?: boolean;
};

const ITEMS: readonly Item[] = [
  { href: PROVIDER_PATHS.today, label: 'Today', icon: LayoutDashboard },
  { href: PROVIDER_PATHS.work, label: 'Work', icon: HardHat },
  { href: PROVIDER_PATHS.opportunities, label: 'Opportunities', icon: Inbox, also: [PROVIDER_PATHS.quotes] },
  { href: PROVIDER_PATHS.onboarding, label: 'Setup', icon: ClipboardList, setup: true },
  { href: PROVIDER_PATHS.profile, label: 'Profile', icon: UserRound, also: [PROVIDER_PATHS.profilePreview] },
  { href: PROVIDER_PATHS.verification, label: 'Verification', icon: BadgeCheck },
  { href: PROVIDER_PATHS.credentials, label: 'Credentials', icon: ScrollText },
  { href: PROVIDER_PATHS.availability, label: 'Availability', icon: CalendarClock },
  { href: PROVIDER_PATHS.searchReadiness, label: 'Readiness', icon: Search },
  // Earnings owns the payout pages: `also` keeps the section marked while somebody is editing the destination,
  // because "Earnings" is where they came from and where the money is.
  { href: PROVIDER_PATHS.earnings, label: 'Earnings', icon: PiggyBank, also: [PROVIDER_PATHS.payouts] },
];

function isCurrent(pathname: string, item: Item): boolean {
  if (pathname === item.href) return true;
  if (item.also?.some(prefix => pathname.startsWith(prefix))) return true;
  // Only a nested route counts as "inside" a section: /provider itself must not match /provider/…,
  // or every page in the workspace would mark Today as current.
  return item.href !== PROVIDER_PATHS.today && pathname.startsWith(`${item.href}/`);
}

export default function WorkspaceNav({ showSetup }: { showSetup: boolean }) {
  const pathname = usePathname();
  /** Setup is only reachable from the rail while the profile is unpublished; afterwards it is a
   *  finished flow, and a permanent "Setup" link reads as "you are not done" forever. */
  const items = ITEMS.filter(item => !item.setup || showSetup);

  return (
    <>
      <nav
        aria-label="Provider workspace"
        className="hidden lg:sticky lg:top-24 lg:block lg:self-start"
      >
        <ul className="flex flex-col gap-1">
          {items.map(item => {
            const current = isCurrent(pathname, item);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={current ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    current
                      ? 'bg-primary-subtle text-primary'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* The phone bar. Five is the most that fits above a thumb without shrinking the targets below
          the 44px a field worker can hit with gloves on, so the tail of the list stays in the side
          rail rather than being squeezed in here. */}
      <nav
        aria-label="Provider workspace"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-solid border-slate-200 bg-white/95 backdrop-blur-sm lg:hidden"
      >
        <ul className="mx-auto flex max-w-xl items-stretch justify-between px-1">
          {items.slice(0, 5).map(item => {
            const current = isCurrent(pathname, item);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={current ? 'page' : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-semibold no-underline transition-colors ${
                    current ? 'text-primary' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/**
 * The rest of the sections, for a phone.
 *
 * ⚠️ WITHOUT THIS, A PHONE CANNOT REACH READINESS OR PAYOUTS. The fixed bar holds five items because
 * five is what fits above a thumb without shrinking the targets, and the rail that holds the other two
 * is hidden below `lg`. A workspace whose owner is standing on a pavement is the one place that must not
 * depend on a wide screen, so the remainder is listed in the flow of the page instead.
 */
export function WorkspaceSectionLinks({ showSetup }: { showSetup: boolean }) {
  const pathname = usePathname();
  const items = ITEMS.filter(item => !item.setup || showSetup);

  return (
    <nav aria-label="All provider sections" className="mt-6 border-t border-solid border-slate-200 pt-4 lg:hidden">
      <p className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">All sections</p>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {items.map(item => {
          const current = isCurrent(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={`text-sm font-semibold no-underline ${
                  current ? 'text-primary' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

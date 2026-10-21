'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BadgeCheck,
  BarChart3,
  Briefcase,
  CalendarClock,
  Cog,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Search,
  TrendingUp,
  UserRound,
} from '@/components/ui/icons';
import { signOutAction } from '@/features/auth/actions';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * The provider workspace's navigation — a dark side rail on a laptop, a bottom bar on a phone.
 *
 * ⚠️ TWO RENDERINGS OF ONE LIST, NOT TWO LISTS. A bottom bar on a wide screen wastes the vertical
 * space a schedule needs, and a side rail on a phone is a drawer nobody opens with one hand on site;
 * both surfaces are the same `ITEMS` array rendered twice, so a new section cannot appear on one and
 * be missing from the other.
 *
 * ⚠️ THE RAIL WEARS THE WORKSPACE'S OWN COLOUR, NOT THE PAGE'S. Deep teal with amber for the current
 * section is the one place in the signed-in product that is not a white surface, and it earns it: the
 * rail is always on screen, and a ninth white panel beside eight white panels is a column you stop
 * seeing. The active row is amber-on-teal rather than a filled amber button, because it is a statement
 * about where you are, not an action to take.
 *
 * ⚠️ THESE ARE LINKS, NOT `role="tab"`. Each item is a different URL with a different document, and
 * the ARIA tabs pattern promises arrow-key switching between panels of one page. `aria-current="page"`
 * on a link is what a screen reader already knows how to read.
 *
 * A CLIENT COMPONENT because the current item is decided by the URL, and a server layout receives
 * params rather than pathname.
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
  { href: PROVIDER_PATHS.today, label: 'Dashboard', icon: LayoutDashboard },
  { href: PROVIDER_PATHS.work, label: 'Work', icon: Briefcase },
  { href: PROVIDER_PATHS.opportunities, label: 'Opportunities', icon: TrendingUp, also: [PROVIDER_PATHS.quotes] },
  { href: PROVIDER_PATHS.onboarding, label: 'Setup', icon: Cog, setup: true },
  { href: PROVIDER_PATHS.profile, label: 'Profile', icon: UserRound, also: [PROVIDER_PATHS.profilePreview] },
  { href: PROVIDER_PATHS.verification, label: 'Verification', icon: BadgeCheck },
  { href: PROVIDER_PATHS.credentials, label: 'Credentials', icon: ScrollText },
  { href: PROVIDER_PATHS.availability, label: 'Availability', icon: CalendarClock },
  { href: PROVIDER_PATHS.searchReadiness, label: 'Readiness', icon: Search },
  // Earnings owns the payout pages: `also` keeps the section marked while somebody is editing the
  // destination, because "Earnings" is where they came from and where the money is.
  { href: PROVIDER_PATHS.earnings, label: 'Earnings', icon: BarChart3, also: [PROVIDER_PATHS.payouts] },
];

function isCurrent(pathname: string, item: Item): boolean {
  if (pathname === item.href) return true;
  if (item.also?.some(prefix => pathname.startsWith(prefix))) return true;
  // Only a nested route counts as "inside" a section: /provider itself must not match /provider/…,
  // or every page in the workspace would mark the dashboard as current.
  return item.href !== PROVIDER_PATHS.today && pathname.startsWith(`${item.href}/`);
}

export default function WorkspaceNav({
  showSetup,
  providerName,
}: {
  showSetup: boolean;
  /** The active provider profile's trading name, for the identity card at the foot of the rail. */
  providerName: string | null;
}) {
  const pathname = usePathname();
  /** Setup is only reachable from the rail while the profile is unpublished; afterwards it is a
   *  finished flow, and a permanent "Setup" link reads as "you are not done" forever. */
  const items = ITEMS.filter(item => !item.setup || showSetup);

  return (
    <>
      {/* ⚠️ PINNED, NOT SCROLLING WITH THE PAGE. The rail is `sticky` under the 4rem top bar and
          exactly `100vh - 4rem` tall, so it stays put while the content beside it scrolls. Its own
          `overflow-y-auto` is the escape hatch for a short viewport: ten sections plus the identity
          card and the sign-out button do not fit on a laptop in landscape, and the alternative to
          scrolling inside the rail is losing the last link off the bottom of the screen. */}
      <aside className="hidden w-64 flex-col justify-between overflow-y-auto border-r border-emerald-950/40 bg-[#0D282E] p-4 text-slate-300 lg:sticky lg:top-16 lg:flex lg:h-[calc(100vh-4rem)]">
        <nav aria-label="Provider workspace" className="flex flex-col gap-1.5">
          {items.map(item => {
            const current = isCurrent(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={`flex cursor-pointer items-center gap-4 rounded-xl px-3.5 py-2.5 text-xs font-semibold no-underline transition-all ${
                  current
                    ? 'border border-tertiary/60 bg-tertiary/30 font-bold text-[#F59E0B] shadow-xs'
                    : 'border border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 ${current ? 'text-[#F59E0B]' : ''}`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-white/10 pt-4">
          {/* Name over badge rather than beside it: the spec's row is `justify-between`, but at 9px
              uppercase "PROVIDER WORKSPACE" is ~130px of a 200px inner width, which leaves a real
              provider name about 70px. Stacked, both stay readable. */}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-white">
                {providerName ?? 'No provider profile'}
              </p>
              <p className="mt-1 inline-block rounded border border-emerald-800/60 bg-emerald-950/60 px-2 py-0.5 font-sans text-[9px] tracking-wider text-emerald-400 uppercase">
                Provider workspace
              </p>
            </div>
          </div>

          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-400 transition-all hover:bg-red-500/20"
            >
              Sign Out
              <LogOut aria-hidden="true" className="h-4 w-4" />
            </button>
          </form>
        </div>
      </aside>

      {/* The phone bar. Five is the most that fits above a thumb without shrinking the targets below
          the 44px a field worker can hit with gloves on, so the tail of the list stays in the side
          rail rather than being squeezed in here. */}
      <nav
        aria-label="Provider workspace"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-solid border-slate-200 bg-white/95 backdrop-blur-sm lg:hidden"
      >
        <ul className="mx-auto flex max-w-xl list-none items-stretch justify-between px-1">
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
      <p className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">All sections</p>
      <ul className="mt-2 flex list-none flex-wrap gap-x-5 gap-y-2">
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

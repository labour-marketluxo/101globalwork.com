'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

/**
 * The trail for the account surfaces: notifications, messages, settings and support.
 *
 * ⚠️ IT STARTS AT "HOME", WHICH IS THE DASHBOARD, AND THAT IS THE ONE WAY OUT. These four surfaces sit
 * outside both workspaces, so without a first crumb the trail is a dead end: the only route back to a
 * dashboard was the workspace switcher in the bar, which is not where anybody looks when they are
 * reading a trail. "Home" is the customer dashboard — the app's default signed-in home — and the
 * provider dashboard is one click away in the switcher directly above.
 *
 * "Account" in the middle is NOT a link, because there is no account index to link to. The four
 * surfaces are siblings that share an owner, not children of a page — inventing an index just to give
 * that crumb an href would be a page whose only content is four links to the pages you were already
 * looking at.
 *
 * ⚠️ EVERY LEVEL IS SPELLED OUT, not just the first. The same reasoning as the provider trail:
 * `/settings/security/sessions` is three levels deep and reading "Settings" alone would tell somebody
 * they are on a different page than the one in front of them.
 */
type Crumb = { label: string; href?: string };

/**
 * Longest match wins, so the sessions trail is reached before the shorter security one.
 * `/app/account/settings` itself is absent on purpose: it redirects to the profile tab, and a crumb that
 * bounces is worse than the same crumb pointing straight at the tab it lands on.
 */
const TRAILS: readonly { match: string; crumbs: Crumb[] }[] = [
  {
    match: '/app/account/settings/security/sessions',
    crumbs: [
      { label: 'Settings', href: '/app/account/settings/profile' },
      { label: 'Security', href: '/app/account/settings/security' },
      { label: 'Sessions' },
    ],
  },
  {
    match: '/app/account/settings/security',
    crumbs: [{ label: 'Settings', href: '/app/account/settings/profile' }, { label: 'Security' }],
  },
  {
    match: '/app/account/settings/notifications',
    crumbs: [{ label: 'Settings', href: '/app/account/settings/profile' }, { label: 'Notifications' }],
  },
  {
    match: '/app/account/settings/profile',
    crumbs: [{ label: 'Settings', href: '/app/account/settings/profile' }, { label: 'Profile' }],
  },
  { match: '/app/account/notifications', crumbs: [{ label: 'Notifications' }] },
  { match: '/app/account/messages', crumbs: [{ label: 'Messages' }] },
  { match: '/app/account/support', crumbs: [{ label: 'Support' }] },
];

export default function AccountBreadcrumbs() {
  const pathname = usePathname();

  const trail =
    [...TRAILS]
      .sort((a, b) => b.match.length - a.match.length)
      .find(entry => pathname === entry.match || pathname.startsWith(`${entry.match}/`))?.crumbs ?? [];

  if (trail.length === 0) return null;

  const crumbs: Crumb[] = [{ label: 'Home', href: '/app/customer' }, { label: 'Account' }, ...trail];

  return (
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
            // "Account" is the only crumb that lands here without an href and without being last, and
            // it must not borrow the current page's weight — a bold, near-black label in the middle of
            // a trail reads as "you are here".
            <span
              aria-current={index === crumbs.length - 1 ? 'page' : undefined}
              className={index === crumbs.length - 1 ? 'font-semibold text-slate-900' : 'text-slate-500'}
            >
              {crumb.label}
            </span>
          )}
        </Fragment>
      ))}
    </div>
  );
}

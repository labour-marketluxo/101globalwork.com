'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * The provider workspace trail, rendered inside the content column rather than under the top bar.
 *
 * WHY IT IS HERE AND NOT IN THE HEADER. The provider workspace already has a full-height side rail
 * naming every section, so a breadcrumb band across the top would be a third place saying the same
 * thing. It sits directly above each page's own title instead, where it reads as "this page, inside
 * this section" — which is the only job a trail has on a page whose section is already visible.
 *
 * ⚠️ EVERY NAMED SEGMENT BECOMES A CRUMB, NOT JUST THE FIRST. `/app/provider/profile/preview` used to read
 * "Provider / Profile", which tells somebody they are on the profile page when they are one level
 * deeper, on the preview. The trail is built from the whole path, so a nested page says where it
 * sits: Provider / Profile / Preview.
 *
 * ⚠️ AN ID SEGMENT IS NOT A CRUMB. `/app/provider/work/{uuid}/evidence` would otherwise print a UUID in
 * the trail. A segment with no label is skipped, which turns that path into
 * Provider / Work / Evidence — the shape a person would draw by hand.
 *
 * NO TRAIL ON THE ROOT. `/app/provider` is the workspace dashboard; it has no parent inside the
 * workspace, and a one-item breadcrumb is just the page title in a smaller font.
 */
const SEGMENT_LABELS: Record<string, string> = {
  work: 'Work',
  opportunities: 'Opportunities',
  onboarding: 'Setup',
  profile: 'Profile',
  preview: 'Preview',
  verification: 'Verification',
  credentials: 'Credentials',
  availability: 'Availability',
  'search-readiness': 'Readiness',
  earnings: 'Earnings',
  payouts: 'Payouts',
  quotes: 'Quotes',
  new: 'New quote',
  requests: 'Quote request',
  assignments: 'Assignment',
  evidence: 'Evidence',
};

/**
 * Only the rail's destinations may be linked. `/app/provider/quotes` has no index page — it is a prefix
 * the rail uses to mark the section — so linking a "Quotes" crumb there would build a 404 into the
 * trail. A crumb that is not one of these renders as plain text instead.
 */
const LINKABLE = new Set<string>(Object.values(PROVIDER_PATHS));

export default function ProviderBreadcrumbs() {
  const pathname = usePathname();

  if (pathname === '/app/provider') return null;

  // Drop `app` and `provider`: what is left is the trail, and an id segment is skipped below.
  const segments = pathname.split('/').filter(Boolean).slice(2);
  const crumbs = segments.flatMap((segment, index) =>
    SEGMENT_LABELS[segment]
      ? [{ label: SEGMENT_LABELS[segment], href: `/app/provider/${segments.slice(0, index + 1).join('/')}` }]
      : [],
  );

  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-xs font-medium text-slate-500">
      <Link href="/app/provider" className="text-slate-500 no-underline transition-colors hover:text-slate-800">
        Provider
      </Link>
      {crumbs.map((crumb, index) => {
        const isCurrent = index === crumbs.length - 1;
        const canLink = !isCurrent && LINKABLE.has(crumb.href);

        return (
          <Fragment key={crumb.href}>
            <span aria-hidden="true" className="font-light text-slate-300">
              /
            </span>
            {canLink ? (
              <Link
                href={crumb.href}
                className="text-slate-500 no-underline transition-colors hover:text-slate-800"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                aria-current={isCurrent ? 'page' : undefined}
                className={isCurrent ? 'font-semibold text-slate-900' : 'text-slate-500'}
              >
                {crumb.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

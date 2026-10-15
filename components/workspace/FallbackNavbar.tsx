'use client';

import { usePathname } from 'next/navigation';
import WorkspaceNavbar from '@/components/workspace/WorkspaceNavbar';

/**
 * The bar for the signed-in routes that are not one of the three sections.
 *
 * ⚠️ IT RENDERS NOTHING FOR THE THREE SECTIONS, WHICH IS THE POINT. `/app/customer/*`, `/app/provider/*` and
 * `/app/account/*` each draw their own bar — the customer and provider ones because they carry a view
 * switcher and, for the provider, an availability toggle that only those layouts can supply. This is
 * the fallback for everything else: /work, /requests/*, /projects/*, /org/*, /programmes/* and
 * /recurring, which had no header at all after the marketing chrome came off the (app) group.
 *
 * The check lives here rather than in the layout because a server layout cannot read the pathname, and
 * a client component that renders null is cheaper than four more layouts.
 */
const OWNED_BY_A_SECTION = /^\/app\/(customer|provider|account)(\/|$)/;

export default function FallbackNavbar({
  displayName,
  initials,
}: {
  displayName: string | null;
  initials: string;
}) {
  const pathname = usePathname();
  if (OWNED_BY_A_SECTION.test(pathname)) return null;

  return <WorkspaceNavbar view="fallback" displayName={displayName} initials={initials} />;
}

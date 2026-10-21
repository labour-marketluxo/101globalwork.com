'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PROJECT_TABS } from '@/features/projects/project-tabs';

/**
 * The shared project tab bar.
 *
 * ⚠️ LINKS, NOT `role="tab"`, for the reason the settings bar gives: these are URLs with documents behind them, and
 * the ARIA tabs pattern promises arrow-key switching between panels of one page. The five section tabs point at
 * anchors inside the overview, which is also a navigation — and the ones that are routes highlight on
 * `aria-current="page"`.
 *
 * A client component because the current tab is decided by the URL, and a server layout receives params rather than
 * the pathname. It holds no state.
 */
export default function ProjectTabs({ assignmentId }: { assignmentId: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Project sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max items-center gap-1 border-b border-solid border-slate-200">
        {PROJECT_TABS.map(tab => {
          const href = tab.href(assignmentId);
          const isRoute = !href.includes('#');
          const isCurrent = isRoute && pathname === href;
          return (
            <li key={tab.key}>
              <Link
                href={href}
                aria-current={isCurrent ? 'page' : undefined}
                className={`relative -mb-px inline-flex items-center gap-2 border-b-2 border-solid px-3.5 py-2.5 text-sm font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  isCurrent
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

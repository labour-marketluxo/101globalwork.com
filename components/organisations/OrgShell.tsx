'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The organisation tab bar. Links, not `role="tab"` — these are URLs, and a screen reader already knows how to read a
 * nav of links with `aria-current="page"`.
 */
export default function OrgTabs({ organisationId }: { organisationId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/org/${organisationId}`, label: 'Overview' },
    { href: `/org/${organisationId}/projects`, label: 'Projects' },
    { href: `/org/${organisationId}/approvals`, label: 'Approvals' },
    { href: `/org/${organisationId}/locations`, label: 'Locations' },
    { href: `/org/${organisationId}/members`, label: 'Members' },
    { href: `/org/${organisationId}/budgets`, label: 'Budgets' },
    { href: `/org/${organisationId}/providers`, label: 'Providers' },
    { href: `/org/${organisationId}/reports`, label: 'Reports' },
  ];
  return (
    <nav aria-label="Organisation sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max items-center gap-1 border-b border-solid border-slate-200">
        {tabs.map(tab => {
          const current = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={`-mb-px inline-flex items-center border-b-2 border-solid px-3.5 py-2.5 text-sm font-semibold no-underline transition-colors ${
                  current ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
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

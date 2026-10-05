'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SETTINGS_TABS } from '@/features/settings/paths';

/**
 * The settings tab bar — horizontal, at the top of the content area, not a sidebar.
 *
 * WHY THIS IS A CLIENT COMPONENT. It has to mark the current tab, and a server layout receives `params`,
 * not `pathname`. The only thing needed from the URL is the path, so the component stays tiny and reads it
 * in the browser. (AuthTopBar used to be a client component for the same reason; it is logo-only now and
 * reads no URL at all.)
 *
 * WHY THESE ARE LINKS AND NOT `role="tab"`. The ARIA tabs pattern describes one document with panels swapped
 * in place — a keyboard user is expected to move between tabs with arrow keys and never leave the page.
 * These are navigations: each one is a different URL with a different document, and announcing them as tabs
 * would promise arrow-key behaviour that does not exist. A `<nav>` of links with `aria-current="page"` is
 * what a screen reader already knows how to read, and it is the only version where the browser's own Back
 * button, middle-click and "open in new tab" all work.
 *
 * ⚠️ THE CURRENT TAB IS MATCHED BY PREFIX, NOT BY EQUALITY, AND THAT IS A FIX RATHER THAN A REFINEMENT.
 * Active sessions live at /settings/security/sessions, which is a page under the Security tab. An equality
 * test left the bar with nothing marked while the visitor was standing on a security screen, which reads as
 * "you are nowhere in particular" — the one thing a settings bar exists to prevent.
 */
export default function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max items-center gap-1 border-b border-solid border-slate-200">
        {SETTINGS_TABS.map(tab => {
          const isCurrent = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isCurrent ? 'page' : undefined}
                className={`relative -mb-px inline-flex items-center gap-2 border-b-2 border-solid px-3.5 py-2.5 text-sm font-semibold no-underline transition-colors ${
                  isCurrent
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
              >
                {tab.label}
                <span className="sr-only"> — {tab.description}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

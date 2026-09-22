'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SETTINGS_TABS } from '@/features/settings/paths';

/**
 * The settings tab bar — horizontal, at the top of the content area, not a sidebar.
 *
 * WHY THIS IS A CLIENT COMPONENT. It has to mark the current tab, and a server layout receives
 * `params`, not `pathname`. Same reason AuthTopBar is one: the only thing needed from the URL is the
 * path, so the component stays tiny and reads it in the browser and on the server alike.
 *
 * WHY THESE ARE LINKS AND NOT `role="tab"`. The ARIA tabs pattern describes one document with panels
 * swapped in place — a keyboard user is expected to move between tabs with arrow keys and never
 * leave the page. These are navigations: each one is a different URL with a different document, and
 * announcing them as tabs would promise arrow-key behaviour that does not exist. A `<nav>` of links
 * with `aria-current="page"` is what a screen reader already knows how to read, and it is the only
 * version where the browser's own Back button, middle-click and "open in new tab" all work.
 *
 * The tabs that do not exist yet are rendered as text with the reason attached, not as links to
 * nothing — a settings row that silently vanishes is a setting people keep looking for.
 */
export default function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max items-center gap-1 border-b border-solid border-slate-200">
        {SETTINGS_TABS.map(tab => {
          const isCurrent = tab.href !== null && pathname === tab.href;

          return (
            <li key={tab.label}>
              {tab.href ? (
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
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  title={tab.note}
                  className="relative inline-flex cursor-not-allowed items-center gap-2 border-b-2 border-solid border-transparent px-3.5 py-2.5 text-sm font-semibold text-slate-400"
                >
                  {tab.label}
                  {/* The tooltip is not available to a keyboard or screen-reader user, so the same
                      reason is in the accessible text.

                      `relative` on the parent is not decoration: `.sr-only` is `position: absolute`,
                      and with no positioned ancestor it anchors to the initial containing block —
                      which puts it OUTSIDE this horizontally scrolling bar. On a 360px screen that
                      leaked 145px of horizontal page scroll, found by bisecting the DOM rather than
                      by reading the class list. */}
                  <span className="sr-only"> — not available. {tab.note}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

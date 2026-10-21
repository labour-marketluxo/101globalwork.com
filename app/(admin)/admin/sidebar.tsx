'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@iconify/react/offline';
import { signOutAction } from '@/features/auth/actions';

import iconBriefcase from '@iconify-icons/ph/briefcase-bold';
import iconCompass from '@iconify-icons/ph/compass-bold';
import iconCurrencyCircleDollar from '@iconify-icons/ph/currency-circle-dollar-bold';
import iconFileText from '@iconify-icons/ph/file-text-bold';
import iconGlobeHemisphereWest from '@iconify-icons/ph/globe-hemisphere-west-bold';
import iconHardHat from '@iconify-icons/ph/hard-hat-bold';
import iconMagnifyingGlass from '@iconify-icons/ph/magnifying-glass-bold';
import iconRobot from '@iconify-icons/ph/robot-bold';
import iconShieldCheck from '@iconify-icons/ph/shield-check-bold';
import iconSignOut from '@iconify-icons/ph/sign-out-bold';
import iconSlidersHorizontal from '@iconify-icons/ph/sliders-horizontal-bold';
import iconSquaresFour from '@iconify-icons/ph/squares-four-bold';
import iconToggleRight from '@iconify-icons/ph/toggle-right-bold';
import iconTreeStructure from '@iconify-icons/ph/tree-structure-bold';
import iconUserGear from '@iconify-icons/ph/user-gear-bold';
import iconUsers from '@iconify-icons/ph/users-bold';
import iconWarningCircle from '@iconify-icons/ph/warning-circle-bold';

/**
 * The admin sidebar's icon set.
 *
 * The data is imported per icon and rendered through Iconify's offline component, matching the rest
 * of the app. That keeps the sidebar server-safe and avoids an Iconify API request for every glyph.
 */
const ADMIN_ICONS = {
  'ph:squares-four-bold': iconSquaresFour,
  'ph:users-bold': iconUsers,
  'ph:hard-hat-bold': iconHardHat,
  'ph:briefcase-bold': iconBriefcase,
  'ph:currency-circle-dollar-bold': iconCurrencyCircleDollar,
  'ph:compass-bold': iconCompass,
  'ph:magnifying-glass-bold': iconMagnifyingGlass,
  'ph:robot-bold': iconRobot,
  'ph:tree-structure-bold': iconTreeStructure,
  'ph:globe-hemisphere-west-bold': iconGlobeHemisphereWest,
  'ph:sliders-horizontal-bold': iconSlidersHorizontal,
  'ph:shield-check-bold': iconShieldCheck,
  'ph:sign-out-bold': iconSignOut,
  'ph:toggle-right-bold': iconToggleRight,
  'ph:warning-circle-bold': iconWarningCircle,
  'ph:file-text-bold': iconFileText,
  'ph:user-gear-bold': iconUserGear,
} as const;

export type AdminSidebarIcon = keyof typeof ADMIN_ICONS;

export type AdminSidebarItem = {
  href: string;
  label: string;
  icon: AdminSidebarIcon;
  /**
   * An optional broader route this item owns. Taxonomy, for example, links to its services page but
   * should still be the active item while the discovery taxonomy page is open.
   */
  match?: string;
  badge?: number;
};

export type AdminSidebarSection = {
  label: string;
  items: AdminSidebarItem[];
};

function normalisePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function matchesPath(pathname: string, item: AdminSidebarItem): boolean {
  const target = normalisePath(item.match ?? item.href);
  return pathname === target || pathname.startsWith(`${target}/`);
}

/**
 * Pick the most specific matching item.
 *
 * Operations owns the whole /admin/operations subtree, so a longest-match rule keeps both
 * "Operations" and "Feature flags" from lighting up on the feature-flags page.
 */
function activeHref(pathname: string, items: AdminSidebarItem[]): string | null {
  let best: AdminSidebarItem | null = null;
  for (const item of items) {
    if (!matchesPath(pathname, item)) continue;
    const target = item.match ?? item.href;
    const bestTarget = best ? (best.match ?? best.href) : '';
    if (!best || target.length > bestTarget.length) best = item;
  }
  return best?.href ?? null;
}

function SidebarLink({ item, current }: { item: AdminSidebarItem; current: boolean }) {
  const badge = typeof item.badge === 'number' && item.badge > 0 ? item.badge : null;

  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer group mb-1 no-underline ${
        current
          ? 'bg-amber-500/10 text-[#F59E0B] border border-amber-500/30 font-bold'
          : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
      }`}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <span
          aria-hidden="true"
          className={
            current
              ? 'w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 transition-colors'
              : 'w-7 h-7 rounded-lg bg-slate-800/50 group-hover:bg-slate-800 border border-slate-700/40 flex items-center justify-center shrink-0 transition-colors'
          }
        >
          <Icon
            icon={ADMIN_ICONS[item.icon]}
            className={`w-4 h-4 ${current ? 'text-[#F59E0B]' : 'text-slate-300 group-hover:text-white'}`}
          />
        </span>
        <span className="truncate">{item.label}</span>
      </span>

      {badge ? (
        <span
          className="flex items-center gap-1 font-mono text-[10px] font-bold text-slate-300 bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded-md"
          aria-label={`${badge} active`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export default function AdminSidebar({
  sections,
  roleLabel,
}: {
  sections: AdminSidebarSection[];
  roleLabel: string;
}) {
  const pathname = normalisePath(usePathname());
  const allItems = sections.flatMap(section => section.items);
  const currentHref = activeHref(pathname, allItems);

  return (
    <aside
      aria-label="Platform administration"
      className="w-64 bg-[#0D282E] text-slate-300 min-h-screen flex flex-col justify-between p-4 border-r border-amber-500/15 select-none max-lg:w-full max-lg:min-h-0 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto"
    >
      <div>
        <div>
          <Link
            href="/admin"
            className="text-lg font-bold text-white tracking-tight flex items-center justify-between no-underline"
          >
            101GlobalWork
          </Link>
          <span className="text-xs text-slate-400 font-medium mb-3 block">Platform control</span>
        </div>

        <nav aria-label="Platform workspace sections" className="mt-4">
          {sections.map((section, sectionIndex) => (
            <div key={section.label}>
              <p
                className={`text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-2 block ${
                  sectionIndex === 0 ? '' : 'mt-6'
                }`}
              >
                {section.label}
              </p>
              <div>
                {section.items.map(item => (
                  <SidebarLink key={item.href} item={item} current={item.href === currentHref} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-8 rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 text-amber-300"
          >
            <Icon icon={ADMIN_ICONS['ph:shield-check-bold']} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-white">{roleLabel}</p>
          </div>
        </div>
        <form action={signOutAction} className="mt-3">
          <button
            type="submit"
            className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 hover:text-amber-200"
          >
            Log out
            <Icon icon={ADMIN_ICONS['ph:sign-out-bold']} className="h-4 w-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}

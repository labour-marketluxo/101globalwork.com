'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, LifeBuoy, MessageSquare, Settings } from '@/components/ui/icons';

/**
 * AccountMenu — the initials badge, opened.
 *
 * WHY THE BADGE IS THE DOOR. `/app/account/notifications`, `/app/account/messages`, `/app/account/settings/*` and
 * `/app/account/support` belong to the account, not to either workspace: the same four surfaces are the
 * signed-in person's whichever side of the business they are on. Putting them in the customer bar
 * would hide them from providers and vice versa, so they hang off the one control that is identical
 * in both bars.
 *
 * ⚠️ IT CLOSES ITSELF FROM THE LINKS, NOT FROM AN EFFECT ON `pathname`. A `setState` in an effect that
 * watches the route is a cascading render the lint config rejects; the panel closes on the click that
 * navigates, and the outside-pointerdown handler covers every other way out.
 *
 * ⚠️ THE CURRENT ITEM IS MARKED BY PREFIX. `/app/account/settings/security/sessions` is three levels below
 * `/app/account/settings`, so an equality test would leave the panel with nothing marked on most of the
 * settings screens.
 *
 * ⚠️ THE TRIGGER CARRIES A CHEVRON, AND THAT IS NOT DECORATION. The initials badge was a plain tile:
 * nothing about it said it opened, so the four surfaces behind it were reachable only by somebody who
 * happened to click a monogram. A caret is the smallest thing that makes it a control.
 */
const ITEMS = [
  { href: '/app/account/notifications', match: '/app/account/notifications', label: 'Notifications', icon: Bell },
  { href: '/app/account/messages', match: '/app/account/messages', label: 'Messages', icon: MessageSquare },
  // Support and then Settings — the same order as the bar's list on the account screens. Two lists of
  // the same four things in two different orders is the kind of detail that makes a product feel loose.
  { href: '/app/account/support', match: '/app/account/support', label: 'Support', icon: LifeBuoy },
  // `href` and `match` differ here on purpose: `/app/account/settings` itself only redirects to the profile
  // tab, so the link goes straight there — but the active test has to stay on `/app/account/settings`, or
  // Security and Notification preferences would light nothing up.
  { href: '/app/account/settings/profile', match: '/app/account/settings', label: 'Settings', icon: Settings },
] as const;

export default function AccountMenu({
  displayName,
  initials,
}: {
  displayName: string | null;
  initials: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        aria-controls="workspace-account-menu"
        aria-label={`Account menu${displayName ? ` for ${displayName}` : ''}`}
        className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white pr-3 pl-1 transition-colors hover:bg-slate-50"
      >
        {/* The avatar sits inside the capsule rather than being the capsule: a circle the size of the
            initials, inset by the pill's own padding, exactly as the bell beside it is a circle. */}
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0D282E] font-sans text-xs font-bold text-[#F59E0B]"
        >
          {initials}
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-slate-900" />
      </button>

      {open ? (
        <div
          id="workspace-account-menu"
          className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-lg"
        >
          <p className="px-2 py-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">Account</p>

          <div className="grid gap-1">
            {ITEMS.map(item => {
              const current = pathname === item.match || pathname.startsWith(`${item.match}/`);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={current ? 'page' : undefined}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 font-semibold no-underline transition-colors ${
                    current
                      ? 'bg-[#0D282E] text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${current ? 'text-[#F59E0B]' : ''}`} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

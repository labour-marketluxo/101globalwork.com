import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PAGE_SHELL } from '@/components/discovery/tokens';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { CUSTOMER_PATHS } from '@/features/customer/intake';

export const metadata = {
  title: 'Customer workspace',
  robots: { index: false, follow: false },
};

/**
 * The customer workspace shell.
 *
 * WHAT IT ADDS TO THE SITE HEADER: a breadcrumb trail and a view switcher. The global header is still
 * there above it (components/navigation/SiteChrome.tsx), so this is a SECONDARY bar — the brief asks
 * for "clean secondary sub-navigation/breadcrumbs", and duplicating the primary nav inside the
 * workspace would give a signed-in visitor two menus that disagree about where they are.
 *
 * THE "ROLE SWITCHER" IS A VIEW SWITCHER, AND SAYS SO. One account can both commission work and offer
 * it — provider capability is granted by the platform after verification, not chosen here. So these
 * links move between two workspaces of the SAME account; they do not change what the account may do.
 * Labelling them "switch role" would imply a permission change that does not happen.
 *
 * No guard here: each page reads data belonging to the signed-in account and guards itself, and the
 * identity is needed here only to greet the visitor by name.
 */
export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(CUSTOMER_PATHS.dashboard)}`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('account_id', (await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle()).data?.id ?? '')
    .maybeSingle();

  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? null;
  const initials = (displayName ?? '?').slice(0, 2).toUpperCase();

  return (
    <div className={PAGE_SHELL}>
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Customer workspace' }]} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-solid border-slate-200 pb-3">
        <nav aria-label="Customer workspace" className="flex flex-wrap items-center gap-1">
          {[
            { href: CUSTOMER_PATHS.dashboard, label: 'Dashboard' },
            { href: '/customer/requests', label: 'My requests' },
            { href: '/customer/bookings', label: 'Bookings' },
            { href: '/customer/payments', label: 'Payments' },
            { href: '/customer/assets', label: 'Assets' },
            { href: CUSTOMER_PATHS.newRequest, label: 'New request' },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 no-underline transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <span className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">View</span>
            <Link href={CUSTOMER_PATHS.dashboard} aria-current="page" className="rounded-full bg-primary-subtle px-3 py-1 text-xs font-semibold text-primary no-underline">
              Customer
            </Link>
            <Link href="/provider" className="rounded-full px-3 py-1 text-xs font-semibold text-slate-500 no-underline hover:bg-slate-100 hover:text-slate-800">
              Provider
            </Link>
          </div>

          <span
            aria-hidden="true"
            title={displayName ?? undefined}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-solid border-slate-300 bg-white font-sans text-xs font-bold text-primary"
          >
            {initials}
          </span>
          <span className="sr-only">Signed in as {displayName ?? 'this account'}</span>
        </div>
      </div>

      <div className="mt-6">{children}</div>
    </div>
  );
}

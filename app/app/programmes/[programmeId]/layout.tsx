import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Building2 } from '@/components/ui/icons';
import { PAGE_SHELL } from '@/components/discovery/tokens';
import { ProgrammeTabs, ProgrammeUnavailable, RoleBadge } from '@/components/programmes/ProgrammeChrome';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { programmePath } from '@/features/programmes/paths';
import { PROGRAMME_KIND_COPY, PROGRAMME_STATUS_COPY } from '@/features/programmes/copy';
import { getProgrammeContext } from '@/features/programmes/programmes';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The programme shell: identity, role badge and the three tabs.
 *
 * ⚠️ AUTHORISATION HAPPENS HERE AND AGAIN IN EVERY PAGE. A layout is not a security boundary — a page can be
 * rendered on its own — so each page asks for its own data and every command re-derives the role. What the layout
 * does is stop an unauthorised visitor being *shown a shell*, which would confirm the programme exists.
 *
 * ⚠️ A PROGRAMME THE CALLER CANNOT SEE IS A 404. Not a "forbidden" page: whether an institution runs a workforce
 * programme, and who is in it, is information about third parties.
 *
 * ⚠️ THE SHELL SHOWS NO FIGURES. Counts of people are noised and thresholded, and a figure rendered by a layout
 * would be drawn before the page decided whether the read succeeded — which is how a withheld number ends up on a
 * screen. Every number lives on the page that owns its privacy payload.
 */
export const metadata: Metadata = {
  title: 'Programme',
  description: 'An institutional workforce programme and its pool.',
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export default async function ProgrammeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ programmeId: string }>;
}) {
  const { programmeId } = await params;
  if (!UUID.test(programmeId)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: programmePath(programmeId) }));

  const context = await getProgrammeContext(programmeId);
  if (context.available && !context.allowed) notFound();

  if (!context.available || !context.programme) {
    return (
      <div className={PAGE_SHELL}>
        <ProgrammeUnavailable what="This programme" />
      </div>
    );
  }

  const programme = context.programme;
  const status = PROGRAMME_STATUS_COPY[programme.status] ?? PROGRAMME_STATUS_COPY.draft;

  return (
    <div className={PAGE_SHELL}>
      <header className="border-b border-solid border-slate-200 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-sans text-[11px] font-bold tracking-wider text-primary uppercase">
              <Building2 aria-hidden="true" className="h-3.5 w-3.5" />
              {PROGRAMME_KIND_COPY[programme.kind] ?? programme.kind}
              <span className="font-sans text-slate-400">{programme.reference}</span>
            </p>
            <h1 className="mt-1 truncate text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              {programme.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{programme.regionLabel}</span>
              {programme.startsOn ? (
                <span className="font-sans">
                  {programme.startsOn}
                  {programme.endsOn ? ` → ${programme.endsOn}` : ''}
                </span>
              ) : null}
              {programme.fundingSource ? <span>· Funded by {programme.fundingSource}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 font-sans text-[11px] font-bold tracking-wider uppercase ${status.className}`}>
              {status.label}
            </span>
            <RoleBadge role={context.role} />
          </div>
        </div>

        {programme.summary ? (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{programme.summary}</p>
        ) : null}
      </header>

      <div className="mt-4">
        <ProgrammeTabs programmeId={programmeId} />
      </div>

      <div className="mt-6">{children}</div>

      <p className="mt-8 text-xs leading-relaxed text-slate-500">
        A worker in this pool is a pseudonym until they consent to be named.{' '}
        <Link href="/help/safety/reporting-a-safety-concern" className="underline underline-offset-2">
          Something wrong with how this programme handles people?
        </Link>{' '}
        A safety concern can be raised in a private case.
      </p>
    </div>
  );
}

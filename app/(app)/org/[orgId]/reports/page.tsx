import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { ReportsDashboard } from '@/components/organisations/OrgReports';
import { PendingButton } from '@/components/provider/ProviderControls';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { getReports } from '@/features/organisations/governance';
import { getOrganisation } from '@/features/organisations/org';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * /org/[orgId]/reports — the analytics engine.
 *
 * ⚠️ THE FILTERS ARE A GET FORM, SO A REPORT IS A LINK. The date window, the site and the category all travel in the
 * query string and the same parameters are passed to the read and to the export — a PDF that covered a different
 * window from the one on screen would be worse than no PDF. "Run analytics report" is this form's submit: there is no
 * hidden second query, because the read already happened when the page was rendered.
 *
 * ⚠️ TWO THINGS THE BRIEF ASKS FOR THAT THE SCHEMA CANNOT BACK, SAID ON THE PAGE. There is no project-tag column in the
 * platform, so there is no tag picker; and the platform stores no per-user saved views, so "Save view" is the link
 * itself — the filters already live in the URL. Both are stated rather than faked, because a control that silently
 * does nothing is worse than one that says why it is not there.
 */
export const metadata: Metadata = {
  title: 'Reports',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ from?: string; to?: string; location?: string; service?: string }>;

export default async function OrganisationReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: SearchParams;
}) {
  const [{ orgId }, query] = await Promise.all([params, searchParams]);
  const [reports, { organisation }] = await Promise.all([
    getReports(orgId, { from: query.from, to: query.to, locationId: query.location, serviceId: query.service }),
    getOrganisation(orgId),
  ]);
  if (reports.denied || reports.unavailable) notFound();

  // The service categories are the platform's own catalog — the same rows a request is filed against, so the filter
  // cannot offer a category no project could be in.
  const supabase = await createSupabaseServerClient();
  const { data: services } = await supabase.from('public_service_catalog').select('service_entity_id,display_name').order('display_name');

  const currencyCode = organisation?.entity.currencyCode ?? 'NGN';
  const exportQuery = new URLSearchParams(
    Object.entries({ from: query.from, to: query.to, location: query.location, service: query.service }).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
    ),
  );
  const hasFilters = exportQuery.size > 0;
  const exportSuffix = hasFilters ? exportQuery.toString() : '';

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Reports</h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
            Completion, SLA compliance, spend distribution and provider reliability across this organisation&apos;s
            projects. Every figure is a count of rows or a sum the platform can point at, and groups too small to report
            without singling somebody out are withheld.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/org/${orgId}/reports/export${exportSuffix ? '?' + exportSuffix : ''}`}
            className="inline-flex items-center rounded-lg border border-solid border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 no-underline transition-colors hover:border-primary hover:text-primary"
            download
          >
            Download CSV
          </a>
          <a
            href={`/org/${orgId}/reports/export?format=pdf${exportSuffix ? '&' + exportSuffix : ''}`}
            className="inline-flex items-center rounded-lg border border-solid border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 no-underline transition-colors hover:border-primary hover:text-primary"
            download
          >
            Download PDF
          </a>
        </div>
      </header>

      <form method="get" action={`/org/${orgId}/reports`} className={`${CARD} flex flex-wrap items-end gap-3 p-5`}>
        <div>
          <label htmlFor="from" className={LABEL}>From</label>
          <input id="from" name="from" type="date" defaultValue={query.from ?? ''} className={FIELD} />
        </div>
        <div>
          <label htmlFor="to" className={LABEL}>To</label>
          <input id="to" name="to" type="date" defaultValue={query.to ?? ''} className={FIELD} />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="location" className={LABEL}>Site</label>
          <select id="location" name="location" defaultValue={query.location ?? ''} className={FIELD}>
            <option value="">Every site</option>
            {(organisation?.locations ?? []).map(location => (
              <option key={location.id} value={location.locationId}>
                {location.label ?? location.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="service" className={LABEL}>Service category</label>
          <select id="service" name="service" defaultValue={query.service ?? ''} className={FIELD}>
            <option value="">Every category</option>
            {(services ?? []).map(service => (
              <option key={service.service_entity_id} value={service.service_entity_id}>{service.display_name}</option>
            ))}
          </select>
        </div>
        <PendingButton
          idle="Run analytics report"
          pending="Running…"
          className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
        />
        {hasFilters ? (
          <Link href={`/org/${orgId}/reports`} className={LINK_ARROW}>Clear</Link>
        ) : null}
      </form>

      <WorkspaceNotice tone="slate" role="status" title="About these controls">
        <p>
          The window defaults to the last twelve months when you leave the dates blank. There is no project-tag filter
          because the platform has no tag on a project to filter by, and &ldquo;Save view&rdquo; is the link in your
          address bar: the filters live in the URL, so bookmarking or sending it reproduces this exact report — the
          platform keeps no per-user saved views.
        </p>
      </WorkspaceNotice>

      <ReportsDashboard reports={reports} currencyCode={currencyCode} />
    </div>
  );
}

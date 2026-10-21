import { getOrganisation } from '@/features/organisations/org';

/**
 * The portfolio, as a CSV.
 *
 * ⚠️ IT APPLIES THE SAME FILTERS THE PAGE APPLIES, from the same read. An export that ignored them would hand
 * somebody a different set of rows from the one they were looking at when they pressed the button.
 */
function csvCell(value: string | null): string {
  return `"${(value ?? '').replaceAll('"', '""')}"`;
}

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { organisation, denied } = await getOrganisation(orgId);
  if (denied || !organisation) {
    return new Response('Not found.', { status: 404, headers: { 'content-type': 'text/plain' } });
  }

  const search = new URL(request.url).searchParams;
  const needle = (search.get('q') ?? '').trim().toLowerCase();
  const rows = organisation.projects.filter(project => {
    if (needle && ![project.title, project.locationName, project.serviceName, project.ownerName, project.providerName]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(needle))) return false;
    if (search.get('site') && project.locationName !== search.get('site')) return false;
    if (search.get('state') && project.state !== search.get('state')) return false;
    if (search.get('owner') === 'unassigned' && project.ownerAccountId) return false;
    if (search.get('owner') && search.get('owner') !== 'unassigned' && project.ownerAccountId !== search.get('owner')) return false;
    if (search.get('sla') && project.sla !== search.get('sla')) return false;
    return true;
  });

  const lines = [['reference', 'title', 'site', 'service', 'state', 'owner', 'provider', 'obligation_state', 'amount', 'currency', 'due', 'sla', 'next_action'].join(',')];
  for (const project of rows) {
    lines.push(
      [
        csvCell('#' + project.requestId.slice(0, 8).toUpperCase()),
        csvCell(project.title),
        csvCell(project.locationName),
        csvCell(project.serviceName),
        csvCell(project.state),
        csvCell(project.ownerName ?? 'unassigned'),
        csvCell(project.providerName),
        csvCell(project.obligationStatus),
        csvCell(project.amountMinor !== null ? (project.amountMinor / 100).toFixed(2) : ''),
        csvCell(project.currencyCode),
        csvCell(project.scheduledEnd ? project.scheduledEnd.slice(0, 10) : ''),
        csvCell(project.sla),
        csvCell(project.nextAction),
      ].join(','),
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="portfolio-${organisation.entity.displayName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${today}.csv"`,
      'cache-control': 'no-store, private',
    },
  });
}

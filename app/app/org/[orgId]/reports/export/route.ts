import { attachmentName, buildPdf, type PdfLine } from '@/lib/documents/pdf';
import { getReports, type ReportsRead } from '@/features/organisations/governance';
import { getOrganisation } from '@/features/organisations/org';
import { formatMoney } from '@/features/provider-workspace/format';

/**
 * The report, as CSV or as a PDF.
 *
 * ⚠️ BOTH FORMATS READ THE SAME ROWS the page reads, with the same filters, from the same read — an export that
 * silently widened the window would be a different report under the same name. The PDF is the platform's own minimal
 * writer rather than a rendering service, so its text is transliterated to ASCII; that is why a currency symbol shows
 * as its three-letter code in the PDF and as a glyph in the CSV.
 */
function csvCell(value: string | null): string {
  return `"${(value ?? '').replaceAll('"', '""')}"`;
}

function amount(minor: number | null): string {
  return minor === null ? '' : (minor / 100).toFixed(2);
}

function pdfLines(reports: ReportsRead, organisationName: string, currencyCode: string, window: string): PdfLine[] {
  const lines: PdfLine[] = [
    { text: `${organisationName} — operational report`, bold: true, size: 16 },
    { text: `Window: ${window}`, size: 10, gapBefore: 6 },
    { text: `Generated: ${reports.generatedAt ? new Date(reports.generatedAt).toISOString().slice(0, 16).replace('T', ' ') : 'unknown'}`, size: 10 },
    {
      text: `Newest record behind these figures: ${reports.dataAsOf ? new Date(reports.dataAsOf).toISOString().slice(0, 10) : 'not recorded'}`,
      size: 10,
    },
    {
      text: `Groups with fewer than ${reports.threshold} projects are withheld; ${reports.suppressedGroups} group(s) were withheld in this window.`,
      size: 9,
      gapBefore: 4,
    },
    { text: 'Completion', bold: true, size: 12, gapBefore: 14 },
    { text: `Projects in window: ${reports.completion.projects}`, size: 10 },
    { text: `Completed: ${reports.completion.completed}`, size: 10 },
    { text: `Cancelled or disputed: ${reports.completion.endedBadly}`, size: 10 },
    {
      text: `Average days to finish: ${reports.completion.completed > 0 ? reports.completion.avgDays : 'not reported (no completions)'}`,
      size: 10,
    },
    { text: 'SLA compliance', bold: true, size: 12, gapBefore: 14 },
    { text: `On time: ${reports.sla.onTime}`, size: 10 },
    { text: `Late: ${reports.sla.late}`, size: 10 },
    { text: `Overdue now: ${reports.sla.currentlyOverdue}`, size: 10 },
    { text: `No date agreed: ${reports.sla.noDate}`, size: 10 },
  ];

  lines.push({ text: 'Spend by site', bold: true, size: 12, gapBefore: 14 });
  if (reports.spendBySite.length === 0) {
    lines.push({ text: 'No site has enough projects in this window to be reported without singling one out.', size: 10 });
  } else {
    for (const entry of reports.spendBySite) {
      lines.push({
        text: `${entry.label}: ${entry.projects} project(s), ${formatMoney(entry.fundedMinor, currencyCode)} funded, ${formatMoney(entry.paidMinor, currencyCode)} paid`,
        size: 10,
      });
    }
  }

  lines.push({ text: 'Spend by service category', bold: true, size: 12, gapBefore: 14 });
  if (reports.spendByService.length === 0) {
    lines.push({ text: 'No category has enough projects in this window to be reported without singling one out.', size: 10 });
  } else {
    for (const entry of reports.spendByService) {
      lines.push({
        text: `${entry.label}: ${entry.projects} project(s), ${formatMoney(entry.fundedMinor, currencyCode)} funded, ${formatMoney(entry.paidMinor, currencyCode)} paid`,
        size: 10,
      });
    }
  }

  lines.push({ text: 'Provider reliability', bold: true, size: 12, gapBefore: 14 });
  if (reports.reliability.length === 0) {
    lines.push({ text: `No provider has ${reports.threshold} or more jobs in this window.`, size: 10 });
  } else {
    for (const provider of reports.reliability) {
      lines.push({
        text: `${provider.name}: ${provider.jobs} jobs, ${provider.completed} completed, ${provider.onTime} on time, ${provider.late} late, ${provider.disputed} disputed`,
        size: 10,
      });
    }
  }

  lines.push({
    text: 'Counts of rows, not a score: this platform does not rate providers.',
    size: 9,
    gapBefore: 14,
  });
  return lines;
}

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const search = new URL(request.url).searchParams;
  const from = search.get('from') ?? undefined;
  const to = search.get('to') ?? undefined;
  const locationId = search.get('location') ?? undefined;
  const serviceId = search.get('service') ?? undefined;

  const [reports, { organisation, denied }] = await Promise.all([
    getReports(orgId, { from, to, locationId, serviceId }),
    getOrganisation(orgId),
  ]);
  if (denied || !organisation || reports.denied || reports.unavailable) {
    return new Response('Not found.', { status: 404, headers: { 'content-type': 'text/plain' } });
  }

  const currencyCode = organisation.entity.currencyCode ?? 'NGN';
  const window = `${from ?? 'twelve months back'} to ${to ?? 'today'}`;
  const today = new Date().toISOString().slice(0, 10);
  const slug = organisation.entity.displayName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  if (search.get('format') === 'pdf') {
    return new Response(buildPdf(pdfLines(reports, organisation.entity.displayName, currencyCode, window)), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': attachmentName(`operational-report-${slug}-${today}`, 'pdf'),
        'Cache-Control': 'private, no-store',
      },
    });
  }

  const lines: string[] = [
    ['section', 'label', 'projects', 'funded', 'paid', 'extra'].join(','),
    ['meta', 'generated_at', '', '', '', csvCell(reports.generatedAt)].join(','),
    ['meta', 'data_as_of', '', '', '', csvCell(reports.dataAsOf)].join(','),
    ['meta', 'aggregation_threshold', '', '', '', csvCell(String(reports.threshold))].join(','),
    ['meta', 'suppressed_groups', '', '', '', csvCell(String(reports.suppressedGroups))].join(','),
    ['completion', 'projects_in_window', '', '', '', csvCell(String(reports.completion.projects))].join(','),
    ['completion', 'completed', '', '', '', csvCell(String(reports.completion.completed))].join(','),
    ['completion', 'cancelled_or_disputed', '', '', '', csvCell(String(reports.completion.endedBadly))].join(','),
    ['completion', 'average_days', '', '', '', csvCell(reports.completion.completed > 0 ? String(reports.completion.avgDays) : '')].join(','),
    ['sla', 'on_time', '', '', '', csvCell(String(reports.sla.onTime))].join(','),
    ['sla', 'late', '', '', '', csvCell(String(reports.sla.late))].join(','),
    ['sla', 'overdue_now', '', '', '', csvCell(String(reports.sla.currentlyOverdue))].join(','),
    ['sla', 'no_date_agreed', '', '', '', csvCell(String(reports.sla.noDate))].join(','),
  ];
  for (const entry of reports.spendBySite) {
    lines.push(['spend_by_site', entry.label, String(entry.projects), amount(entry.fundedMinor), amount(entry.paidMinor), csvCell(currencyCode)].join(','));
  }
  for (const entry of reports.spendByService) {
    lines.push(['spend_by_service', entry.label, String(entry.projects), amount(entry.fundedMinor), amount(entry.paidMinor), csvCell(currencyCode)].join(','));
  }
  for (const provider of reports.reliability) {
    lines.push(
      [
        'provider_reliability',
        provider.name,
        String(provider.jobs),
        amount(null),
        amount(null),
        csvCell(`${provider.completed} completed, ${provider.onTime} on time, ${provider.late} late, ${provider.disputed} disputed`),
      ].join(','),
    );
  }

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="operational-report-${slug}-${today}.csv"`,
      'cache-control': 'no-store, private',
    },
  });
}

import { getBudgets } from '@/features/organisations/governance';
import { getOrganisation } from '@/features/organisations/org';

/**
 * The ledger breakdown, as a CSV.
 *
 * ⚠️ IT APPLIES THE SAME FILTER THE PAGE APPLIES, from the same read. A centre filter that was dropped here would
 * hand somebody every cost centre's lines under a filename that said one — which is the kind of export that gets
 * pasted into a board pack.
 */
function csvCell(value: string | null): string {
  return `"${(value ?? '').replaceAll('"', '""')}"`;
}

/** Minor units to a plain decimal string, or blank when the figure does not exist — never a bare zero for "unfunded". */
function amount(minor: number | null): string {
  return minor === null ? '' : (minor / 100).toFixed(2);
}

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const [budgets, { organisation, denied }] = await Promise.all([getBudgets(orgId), getOrganisation(orgId)]);
  if (denied || !organisation || budgets.denied || budgets.unavailable) {
    return new Response('Not found.', { status: 404, headers: { 'content-type': 'text/plain' } });
  }

  const centreParam = new URL(request.url).searchParams.get('centre');
  const selected = centreParam ? budgets.centres.find(centre => centre.id === centreParam) ?? null : null;
  const ledger = selected ? budgets.transactions.filter(entry => entry.costCentre === selected.name) : budgets.transactions;

  const lines: string[] = [];
  if (selected) {
    lines.push(['cost_centre', 'code', 'allocated', 'committed', 'paid', 'variance', 'currency'].join(','));
    lines.push(
      [
        csvCell(selected.name),
        csvCell(selected.code),
        csvCell(amount(selected.allocatedMinor)),
        csvCell(amount(selected.committedMinor)),
        csvCell(amount(selected.paidMinor)),
        csvCell(amount(selected.varianceMinor)),
        csvCell(selected.currencyCode),
      ].join(','),
    );
    lines.push('');
  }

  lines.push(
    [
      'reference',
      'project',
      'cost_centre',
      'project_state',
      'obligation_state',
      'amount',
      'currency',
      'payout_state',
      'paid',
      'at',
    ].join(','),
  );
  for (const entry of ledger) {
    lines.push(
      [
        csvCell(entry.reference),
        csvCell(entry.title),
        csvCell(entry.costCentre),
        csvCell(entry.state),
        csvCell(entry.obligationStatus),
        csvCell(amount(entry.amountMinor)),
        csvCell(entry.currencyCode),
        csvCell(entry.payoutStatus),
        csvCell(amount(entry.paidMinor)),
        csvCell(entry.at ? entry.at.slice(0, 10) : ''),
      ].join(','),
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const slug = organisation.entity.displayName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const scope = selected ? selected.code.toLowerCase() : 'all-cost-centres';
  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="ledger-${slug}-${scope}-${today}.csv"`,
      'cache-control': 'no-store, private',
    },
  });
}

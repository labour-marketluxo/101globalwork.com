import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProviderContext } from '@/features/provider-workspace/context';

/**
 * The earnings and tax summary, as a CSV.
 *
 * ⚠️ IT EXPORTS THE SAME ROWS THE PAGE SHOWS, FROM THE SAME COMMAND. A download that recomputed the figures would
 * be a second implementation of the earnings maths, and the day the two disagree is the day somebody files a
 * return against the wrong number. The route asks `get_my_earnings_command` for the same document.
 *
 * ⚠️ CSV RATHER THAN PDF, DELIBERATELY. This is data for an accountant or a spreadsheet, and it is the format
 * that survives being opened by whichever tool they use. The platform's PDF writer is for documents a customer
 * reads and signs, not for figures somebody will total.
 *
 * ⚠️ NO CUSTOMER IDENTITY IN THE EXPORT. The rows carry the request reference, the dates and the money. A
 * provider's accountant needs the amounts; the customer's name is not a financial field, and leaving it out keeps
 * the export safe to email to somebody who is not a party to these jobs.
 */

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  // Quote everything and double any quote inside: money and dates are safe, and a description with a comma in it
  // is the one thing that breaks a naive export.
  return `"${text.replaceAll('"', '""')}"`;
}

function money(minor: number): string {
  return (minor / 100).toFixed(2);
}

export async function GET() {
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) {
    return new Response('Not signed in.', { status: 401, headers: { 'content-type': 'text/plain' } });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_earnings_command', { p_provider_id: provider.id });
  if (error) {
    return new Response('The earnings record could not be read.', { status: 503, headers: { 'content-type': 'text/plain' } });
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];

  const header = [
    'request_reference',
    'request_id',
    'description',
    'completed_at',
    'currency',
    'gross_paid',
    'platform_fee',
    'refunded',
    'net_owed',
    'payout_status',
    'payout_paid_at',
    'payout_reference',
  ];

  const lines = [header.join(',')];
  for (const item of items) {
    const requestId = String(item.request_id ?? '');
    lines.push(
      [
        csvCell(requestId ? `#${requestId.slice(0, 8).toUpperCase()}` : ''),
        csvCell(requestId),
        csvCell(String(item.need_text ?? '')),
        csvCell(item.completed_at ? String(item.completed_at).slice(0, 10) : ''),
        csvCell(String(item.currency_code ?? '')),
        csvCell(money(Number(item.gross_minor ?? 0))),
        // The fee column is the ledger's own figure. It is zero because no fee schedule is in force, and the CSV
        // says so in the same way the page does rather than leaving the reader to wonder.
        csvCell(money(0)),
        csvCell(money(Number(item.refunded_minor ?? 0))),
        csvCell(money(Number(item.net_payable_minor ?? 0))),
        csvCell(item.payout_status ? String(item.payout_status) : 'no_payout_yet'),
        csvCell(item.payout_paid_at ? String(item.payout_paid_at).slice(0, 10) : ''),
        csvCell(item.payout_reference ? String(item.payout_reference) : ''),
      ].join(','),
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="earnings-${provider.displayName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${today}.csv"`,
      // Never cached: this is a private financial record.
      'cache-control': 'no-store, private',
    },
  });
}

import { attachmentName, buildPdf, type PdfLine } from '@/lib/documents/pdf';
import { formatMoney, getCustomerPayment, getCustomerPaymentActivity } from '@/features/customer/payments';

export const runtime = 'nodejs';

/**
 * The payment, as a file.
 *
 * ⚠️ IT IS HEADED BY WHAT THE LEDGER SAYS, AND IT IS NOT CALLED A RECEIPT UNTIL THAT IS SOMETHING. A payment
 * whose provider event has not been matched to a balanced ledger transaction is headed "payment record —
 * awaiting reconciliation" and says in words that it is not proof of payment. Calling it a receipt because a
 * gateway page said "success" would be this platform asserting somebody else's claim about its own books.
 *
 * ⚠️ THE DOWNLOAD GOES THROUGH THE SAME OWNERSHIP CHECK AS THE PAGE. A route handler is reachable directly, so
 * it cannot lean on the page having run: `getCustomerPayment` returns nothing for another account's payment
 * and this answers 404 — the same answer as a payment that does not exist, so an id cannot be probed.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;

  const { row } = await getCustomerPayment(paymentId);
  if (!row) return new Response('Not found', { status: 404 });

  const { attempts } = await getCustomerPaymentActivity(paymentId);
  const money = (amount: number) => formatMoney(amount, row.currencyCode);
  const reconciled = row.reconciledState === 'reconciled';
  const stamp = (value: string) => new Date(value).toUTCString();

  const lines: PdfLine[] = [
    { text: reconciled ? 'Payment receipt' : 'Payment record — awaiting reconciliation', bold: true, size: 18 },
    { text: `${row.requestLabel} — ${row.providerName}`, size: 11, gapBefore: 6 },
    {
      text: `Payment reference: ${row.paymentReference ?? 'no payment has been started'}`,
      size: 9.5,
      gapBefore: 2,
    },
    { text: `Record created: ${stamp(row.createdAt)}`, size: 9.5 },
    { text: `Total: ${money(row.amountMinor)}`, bold: true, size: 14, gapBefore: 12 },
    { text: '', gapBefore: 4 },
    { text: 'Itemised', bold: true, size: 12 },
    { text: `Agreed price for the work  —  ${money(row.amountMinor)}`, size: 10.5 },
    { text: `Platform fee  —  ${money(0)} (no fee schedule is in force)`, size: 10.5 },
    { text: `Charged in total  —  ${money(row.amountMinor)}`, bold: true, size: 10.5 },
  ];

  if (row.refundedMinor > 0) {
    lines.push({ text: `Refunded so far  —  ${money(row.refundedMinor)}`, size: 10.5, gapBefore: 4 });
  }

  lines.push({ text: 'The ledger', bold: true, size: 12, gapBefore: 14 });
  lines.push({
    text: reconciled
      ? `A verified payment event was matched to a balanced transaction in the platform's ledger on ${stamp(row.settledAt ?? row.reconciledAt ?? row.updatedAt)}. That entry, not this file, is the financial record.`
      : 'No verified payment event has been matched to a balanced ledger transaction for this payment. Nothing on this document is proof that money has been taken.',
    size: 10.5,
  });
  lines.push({
    text: row.releasedAt
      ? `The provider was paid on ${stamp(row.releasedAt)}, after the work was approved.`
      : 'The provider has not been paid. Money is held against this job until the work is approved.',
    size: 10,
  });
  lines.push({ text: `Account status: ${row.obligationStatus.replace(/_/g, ' ')}`, size: 10 });

  if (attempts.length > 0) {
    lines.push({ text: 'Payments attempted', bold: true, size: 12, gapBefore: 12 });
    for (const attempt of attempts) {
      lines.push({
        text: `${attempt.providerAdapter} · ${attempt.status.replace(/_/g, ' ')} · started ${stamp(attempt.createdAt)}${attempt.paymentReference ? ` · ref ${attempt.paymentReference}` : ''}`,
        size: 10,
      });
      for (const event of attempt.events) {
        lines.push({
          text: `   event ${event.eventType} — ${event.status}${event.result ? ` (${event.result})` : ''} — received ${stamp(event.receivedAt)}`,
          size: 9.5,
        });
      }
    }
  }

  lines.push({ text: 'About this document', bold: true, size: 12, gapBefore: 14 });
  lines.push({
    text:
      'This was generated from the platform record for this payment at your request. It is a copy: the record on ' +
      'the platform is the authority, and the ledger entry behind a reconciled payment is the financial fact.',
    size: 10,
  });
  lines.push({
    text:
      'The platform never holds your card details. The payment itself was taken by the payment provider named ' +
      'above, on their own secure page, and their own receipt is issued by them.',
    size: 10,
  });

  return new Response(buildPdf(lines), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': attachmentName(
        `${reconciled ? 'receipt' : 'payment-record'}-${row.paymentReference ?? row.paymentId.slice(0, 8)}`,
        'pdf',
      ),
      'Cache-Control': 'private, no-store',
    },
  });
}

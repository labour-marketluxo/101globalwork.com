import { attachmentName, buildPdf, type PdfLine } from '@/lib/documents/pdf';
import {
  formatMoney,
  lineItemSubtotal,
  quoteActionability,
  quoteAttributes,
} from '@/features/customer/quotes';
import { groupQuotes } from '@/features/customer/quotes';
import { getCustomerRequestDetail } from '@/features/customer/requests';

export const runtime = 'nodejs';

/**
 * The quote, as a file.
 *
 * ⚠️ THE DOWNLOAD GOES THROUGH THE SAME OWNERSHIP CHECK AS THE PAGE, AND IT IS THE ONLY THING THAT AUTHORISES
 * IT. A route handler is reachable directly, so it cannot lean on the page having run: `getCustomerRequestDetail`
 * returns null for a request that is not this account's, and a null here is a 404 — the same answer as a quote
 * that does not exist, so an id cannot be probed for existence.
 *
 * ⚠️ THE DOCUMENT IS A COPY OF A ROW, NOT THE AUTHORITY. It says so on its face: the authoritative record is
 * the quote version in the platform, the accepted version is locked, and nothing said in a conversation is
 * part of it. A file that read like a contract on its own would be the wrong thing to hand somebody.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string; quoteId: string }> },
) {
  const { requestId, quoteId } = await params;

  const request = await getCustomerRequestDetail(requestId);
  if (!request) return new Response('Not found', { status: 404 });

  const quote = request.quotes.find(candidate => candidate.quoteId === quoteId);
  if (!quote) return new Response('Not found', { status: 404 });

  const group = groupQuotes(request.quotes).find(candidate => candidate.providerId === quote.providerId);
  if (!group) return new Response('Not found', { status: 404 });

  const reference = `REQ-${request.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const actions = quoteActionability(quote, {
    requestState: request.state,
    hasActiveAssignment: Boolean(request.assignment),
  });
  const money = (amount: number) => formatMoney(amount, quote.currencyCode);

  const lines: PdfLine[] = [
    { text: `Quote ${quote.versionLabel}`, bold: true, size: 18 },
    { text: `${group.providerName} — for request ${reference}`, size: 11, gapBefore: 6 },
    {
      text:
        `Submitted ${new Date(quote.submittedAt).toUTCString()} · Status: ${quote.status}` +
        (quote.lockedAt ? ` · Locked ${new Date(quote.lockedAt).toUTCString()}` : ''),
      size: 9,
      gapBefore: 2,
    },
    { text: `Total price: ${money(quote.totalMinor)}`, bold: true, size: 14, gapBefore: 12 },
    { text: '', gapBefore: 4 },
    { text: 'Cost breakdown', bold: true, size: 12 },
  ];

  if (quote.lineItems.length > 0) {
    for (const item of quote.lineItems) {
      lines.push({ text: `${item.label}  —  ${money(item.amountMinor)}`, size: 10.5 });
    }
    lines.push({ text: `Subtotal for the work: ${money(lineItemSubtotal(quote.lineItems))}`, size: 10.5, gapBefore: 4 });
  } else {
    lines.push({
      text: 'The provider priced this in a single number and did not itemise it.',
      size: 10.5,
    });
  }
  lines.push({ text: `Taxes and fees included in the total: ${money(quote.taxesAndFeesMinor)}`, size: 10.5 });
  lines.push({ text: `Total: ${money(quote.totalMinor)}`, bold: true, size: 10.5 });

  if (quote.optionalAddons.length > 0) {
    lines.push({ text: 'Optional add-ons', bold: true, size: 12, gapBefore: 12 });
    lines.push({
      text: 'Offered on top of the total above. Nothing is charged for one of these unless you ask for it.',
      size: 9.5,
    });
    for (const addon of quote.optionalAddons) {
      lines.push({ text: `${addon.label}  —  ${money(addon.amountMinor)}`, size: 10.5 });
    }
  }

  lines.push({ text: 'What the provider wrote about this price', bold: true, size: 12, gapBefore: 12 });
  lines.push({ text: quote.summary?.trim() || 'Nothing beyond the total was written for this version.', size: 10.5 });

  lines.push({ text: 'Terms', bold: true, size: 12, gapBefore: 12 });
  for (const attribute of quoteAttributes(quote)) {
    if (['total', 'lineItems', 'taxes', 'addons'].includes(attribute.key)) continue;
    lines.push({ text: `${attribute.label}: ${attribute.value}`, bold: true, size: 10.5, gapBefore: 4 });
    if (attribute.detail) lines.push({ text: attribute.detail, size: 10 });
  }

  lines.push({ text: 'About this document', bold: true, size: 12, gapBefore: 14 });
  lines.push({
    text:
      'This is a copy of one quote version held by 101GlobalWork, generated for you on request. The record on ' +
      'the platform is the authority, not this file.',
    size: 10,
  });
  if (quote.lockedAt) {
    lines.push({
      text:
        `Version ${quote.versionLabel} was accepted and is locked. The platform refuses any change to it, and the ` +
        'assignment and its payment obligation point at that exact version. A change of price or scope is a new ' +
        'version, not an edit to this one.',
      size: 10,
    });
  } else {
    lines.push({
      text:
        `Version ${quote.versionLabel} is an offer, not an agreement. Accepting it would lock this version, decline ` +
        'the other quotes on the request, and create a payment obligation that is funded separately.',
      size: 10,
    });
  }
  lines.push({
    text:
      'Nothing said in a chat, on a phone call or in person is part of this document. A promise a provider makes ' +
      'elsewhere is not part of the agreement unless it appears in a quote version or in the signed agreement.',
    size: 10,
  });
  if (!actions.canAccept) {
    lines.push({ text: `This version cannot be accepted: ${actions.blockedReason ?? 'it is not the current offer.'}`, size: 10 });
  }

  const fileName = attachmentName(`quote-${quote.versionLabel}-${reference}`, 'pdf');
  return new Response(buildPdf(lines), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': fileName,
      'Cache-Control': 'private, no-store',
    },
  });
}

import { attachmentName, buildPdf, type PdfLine } from '@/lib/documents/pdf';
import { ASSET_EVENT_KIND_LABEL, formatDate, getCustomerAsset } from '@/features/customer/assets';

export const runtime = 'nodejs';

/**
 * The asset record, as a file — the "Download Documents" action.
 *
 * ⚠️ IT IS THE RECORD, AND IT SAYS WHAT IT IS NOT. The platform holds no warranty certificate, no manual and no
 * proof of ownership: what it holds is the customer's own entries and links to documents kept elsewhere. A file
 * headed "warranty" would be a document this platform has no standing to issue, so the heading is the record and
 * the links are printed as links.
 *
 * ⚠️ THE DOWNLOAD GOES THROUGH THE SAME OWNERSHIP CHECK AS THE PAGE. A route handler is reachable directly, so
 * it cannot lean on the page having run: `getCustomerAsset` returns nothing for another account's asset and this
 * answers 404 — the same answer as an asset that does not exist, so an id cannot be probed.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;

  const { detail } = await getCustomerAsset(assetId);
  if (!detail) return new Response('Not found', { status: 404 });

  const lines: PdfLine[] = [
    { text: detail.name, bold: true, size: 18 },
    { text: `${detail.category}${detail.makeModel ? ` — ${detail.makeModel}` : ''}`, size: 11, gapBefore: 6 },
    { text: `Asset record generated ${new Date().toUTCString()}`, size: 9 },
  ];

  lines.push({ text: 'The details', bold: true, size: 12, gapBefore: 14 });
  lines.push({ text: `Serial number: ${detail.serialNumber ?? 'not recorded'}`, size: 10.5 });
  lines.push({ text: `Installed: ${formatDate(detail.installedOn)}`, size: 10.5 });
  lines.push({ text: `Where: ${detail.locationName ?? 'not recorded'}`, size: 10.5 });
  lines.push({ text: `Serviced by: ${detail.installedByName ?? 'nobody recorded'}`, size: 10.5 });
  lines.push({
    text: `Warranty: ${detail.warrantyExpiresOn ? `until ${formatDate(detail.warrantyExpiresOn)}${detail.warrantyProviderName ? `, held by ${detail.warrantyProviderName}` : ''}` : 'not recorded'}`,
    size: 10.5,
  });
  lines.push({ text: `Next service due: ${formatDate(detail.nextServiceDueOn)}`, size: 10.5 });
  if (detail.notes) lines.push({ text: `Notes: ${detail.notes}`, size: 10.5 });

  if (detail.sourceRequestLabel) {
    lines.push({ text: `Installed through the job: ${detail.sourceRequestLabel}`, size: 10.5 });
  }

  lines.push({ text: 'History', bold: true, size: 12, gapBefore: 14 });
  if (detail.events.length === 0) {
    lines.push({ text: 'Nothing recorded.', size: 10.5 });
  } else {
    for (const event of detail.events) {
      lines.push({
        text: `${formatDate(event.occurredOn)} — ${ASSET_EVENT_KIND_LABEL[event.kind] ?? event.kind}`,
        bold: true,
        size: 10.5,
        gapBefore: 6,
      });
      lines.push({ text: event.summary, size: 10.5 });
      lines.push({
        text: [
          event.providerName ? `By ${event.providerName}` : 'Recorded by the owner',
          event.recordedAt ? `written down ${new Date(event.recordedAt).toLocaleDateString('en-GB')}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        size: 9,
      });
      for (const url of event.documentUrls) lines.push({ text: `Document: ${url}`, size: 9 });
    }
  }

  if (detail.claims.length > 0) {
    lines.push({ text: 'Warranty claims', bold: true, size: 12, gapBefore: 14 });
    for (const claim of detail.claims) {
      lines.push({
        text: `${claim.status === 'open' ? 'Open' : 'Withdrawn'}${claim.providerName ? ` — with ${claim.providerName}` : ''}`,
        bold: true,
        size: 10.5,
        gapBefore: 6,
      });
      lines.push({ text: claim.reason, size: 10.5 });
      lines.push({ text: `Raised ${new Date(claim.createdAt).toLocaleDateString('en-GB')}`, size: 9 });
      for (const url of claim.documentUrls) lines.push({ text: `Document: ${url}`, size: 9 });
    }
  }

  if (detail.documentUrls.length > 0) {
    lines.push({ text: 'Document links held', bold: true, size: 12, gapBefore: 14 });
    for (const url of detail.documentUrls) lines.push({ text: url, size: 9.5 });
  }

  lines.push({ text: 'What this document is', bold: true, size: 12, gapBefore: 14 });
  lines.push({
    text:
      'This is a copy of a record the owner of the asset wrote on 101GlobalWork. The platform holds no warranty ' +
      'certificate, no manual and no proof of ownership, and decides no warranty claims: any document referred ' +
      'to above is held by whoever issued it, at the link printed.',
    size: 10,
  });
  lines.push({
    text: 'Nothing in this file is a statement by the platform about the asset, its condition or its warranty.',
    size: 10,
  });

  return new Response(buildPdf(lines), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': attachmentName(`asset-${detail.name}`, 'pdf'),
      'Cache-Control': 'private, no-store',
    },
  });
}

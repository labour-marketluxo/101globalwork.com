import { attachmentName, buildPdf, type PdfLine } from '@/lib/documents/pdf';
import { CONSENT_VERSION, agreementHash, buildAgreementDocument, getProjectAgreement } from '@/features/customer/agreement';
import { formatMoney } from '@/features/customer/quotes';

export const runtime = 'nodejs';

/**
 * The agreement, as a file — the "Download Draft Agreement" action.
 *
 * ⚠️ IT IS A DRAFT UNTIL IT IS ACCEPTED, AND THE FILE SAYS WHICH ONE IT IS. `getProjectAgreement` asserts the
 * caller owns the assignment, and the acceptance record decides the heading: an unsigned copy is headed as a
 * draft and states the fingerprint of the terms in it, so a customer who prints before deciding holds a
 * document that cannot be mistaken for the recorded one.
 *
 * ⚠️ THE FINGERPRINT IS THE ONE THE PAGE SHOWED. `buildAgreementDocument` and `agreementHash` are the same
 * pair the acceptance flow uses, so the hash printed here is comparable with the one stored against an
 * acceptance — which is the only way this file can be checked against what was signed.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const agreement = await getProjectAgreement(projectId);
  if (!agreement) return new Response('Not found', { status: 404 });

  const { sections, canonical } = buildAgreementDocument(agreement);
  const reference = `REQ-${agreement.requestId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const accepted = agreement.acceptance;

  const lines: PdfLine[] = [
    { text: accepted ? 'Project agreement (accepted copy)' : 'Project agreement — draft', bold: true, size: 18 },
    {
      text: `${reference} · ${formatMoney(agreement.totalMinor, agreement.currencyCode)} with ${agreement.providerName} · quote ${agreement.quoteVersionLabel}`,
      size: 10.5,
      gapBefore: 6,
    },
    accepted
      ? { text: `Accepted ${new Date(accepted.acceptedAt).toUTCString()} after verifying by ${accepted.authMethod}.`, size: 9.5, gapBefore: 2 }
      : { text: 'Not accepted yet. Nothing in this file has been agreed to by signing it.', size: 9.5, gapBefore: 2 },
  ];

  for (const section of sections) {
    lines.push({ text: section.title, bold: true, size: 12.5, gapBefore: 14 });
    for (const line of section.lines) {
      lines.push({ text: line, size: 10.5 });
    }
  }

  lines.push({ text: 'The record', bold: true, size: 12.5, gapBefore: 16 });
  lines.push({ text: `Terms version: ${CONSENT_VERSION}`, size: 10 });
  lines.push({
    text: `Fingerprint of these terms (sha256): ${accepted ? accepted.agreementHash : agreementHash(canonical)}`,
    size: 9,
  });
  lines.push({
    text:
      accepted
        ? 'The fingerprint above is the one recorded when this agreement was accepted. If the terms on the platform change, their fingerprint changes with them and this copy will no longer match — which is how the platform tells you that what you accepted is not what is now shown.'
        : 'This fingerprint identifies exactly these terms. It is what gets recorded if you accept them, so you can check later that the terms you agreed to are the terms on the page.',
    size: 9.5,
  });
  lines.push({
    text:
      'Acceptance is a recorded clickwrap with a one-time code sent to your email. It is not an e-signature: no signature is produced and no cryptographic signing key is involved.',
    size: 9.5,
  });
  lines.push({
    text:
      'Nothing promised in a chat, a phone call or in person replaces the accepted quote version or these terms.',
    size: 9.5,
  });

  const fileName = attachmentName(`agreement-${reference}${accepted ? '' : '-draft'}`, 'pdf');
  return new Response(buildPdf(lines), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': fileName,
      'Cache-Control': 'private, no-store',
    },
  });
}

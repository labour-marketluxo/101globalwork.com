/**
 * A minimal PDF writer, sized for the one thing this platform has to hand a customer on paper: a quote and an
 * agreement.
 *
 * WHY NOT A LIBRARY. The brief asks for "Download PDF" on the quote and a "Download Draft Agreement" on the
 * agreement, and the alternative on offer was the browser's print dialog. A dependency that pulls in a font
 * engine to lay out two pages of text is a large, permanent surface for a small, occasional need — and every
 * package added here has to be trusted by a user handing over money.
 *
 * ⚠️ WHAT THIS DELIBERATELY DOES NOT DO. No compression, no images, no embedded fonts, no tables drawn as
 * graphics. One page size, two base-14 fonts, one text run per line, positioned explicitly. Every one of those
 * choices removes a way for the output to be subtly wrong, and the documents this renders are plain prose with
 * figures in them.
 *
 * ⚠️ THE TEXT IS TRANSLITERATED TO ASCII. Standard PDF text uses a single-byte encoding, and this writer does
 * not declare one. Rather than risk a currency symbol rendering as a different glyph, `toPdfText` maps the
 * characters this platform actually produces (typographic punctuation, and the currency signs Intl emits) and
 * replaces anything else with a question mark. A missing symbol is visible and harmless; a wrong one on an
 * agreement is not.
 */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const MARGIN_Y = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

/** Helvetica's average glyph advance is a shade under half the point size; used only to choose line breaks. */
const GLYPH_RATIO = 0.5;

export type PdfLine = {
  text: string;
  /** Rendered in Helvetica-Bold. Used for titles and section headings. */
  bold?: boolean;
  size?: number;
  /** Vertical space before this line. */
  gapBefore?: number;
};

const TRANSLITERATIONS: Record<string, string> = {
  '\u20a6': 'NGN ', // ₦
  '\u20ac': 'EUR ',
  '\u00a3': 'GBP ',
  '\u20b5': 'GHS ',
  '\u2019': "'",
  '\u2018': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2014': '-',
  '\u2013': '-',
  '\u2026': '...',
  '\u00b7': '-',
  '\u00a0': ' ',
};

function toPdfText(value: string): string {
  let out = '';
  for (const character of value) {
    const mapped = TRANSLITERATIONS[character] ?? character;
    for (const candidate of mapped) {
      const code = candidate.codePointAt(0) ?? 0;
      out += code >= 32 && code <= 126 ? candidate : '?';
    }
  }
  // Escaping belongs to the PDF string syntax, not to the document, so it happens after transliteration.
  return out.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Break on spaces where possible, and mid-word only when a single word cannot fit. */
function wrap(text: string, size: number): string[] {
  const maxChars = Math.max(20, Math.floor(CONTENT_WIDTH / (size * GLYPH_RATIO)));
  const lines: string[] = [];

  for (const paragraph of text.replace(/\r\n/g, '\n').split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(' ')) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      let remainder = word;
      while (remainder.length > maxChars) {
        lines.push(remainder.slice(0, maxChars));
        remainder = remainder.slice(maxChars);
      }
      current = remainder;
    }
    lines.push(current);
  }

  return lines;
}

type Placement = { text: string; x: number; y: number; font: 'F1' | 'F2'; size: number };

/**
 * Lay the lines out, starting a new page when the next line would cross the bottom margin.
 *
 * ⚠️ A LINE THAT DOES NOT FIT ON A PAGE APPEARS IN FULL ON THE NEXT ONE. Nothing is clipped and nothing is
 * shrunk to fit; a document that silently dropped the last clause of a warranty would be worse than one with
 * an extra page.
 */
function paginate(lines: PdfLine[]): Placement[][] {
  const pages: Placement[][] = [];
  let current: Placement[] = [];
  let y = PAGE_HEIGHT - MARGIN_Y;

  for (const line of lines) {
    const size = line.size ?? 10.5;
    const leading = size * 1.45;
    if (line.gapBefore && current.length > 0) y -= line.gapBefore;

    for (const wrapped of wrap(line.text, size)) {
      if (y - leading < MARGIN_Y) {
        pages.push(current);
        current = [];
        y = PAGE_HEIGHT - MARGIN_Y;
      }
      y -= leading;
      // Empty strings are paragraph breaks: the space is already taken by the leading above.
      if (wrapped !== '') {
        current.push({ text: wrapped, x: MARGIN_X, y, font: line.bold ? 'F2' : 'F1', size });
      }
    }
  }

  if (current.length > 0) pages.push(current);
  // A document with no lines still needs one page, or the /Pages object has no /Kids.
  return pages.length > 0 ? pages : [[]];
}

function contentStream(placements: Placement[]): string {
  const parts = ['BT'];
  for (const placement of placements) {
    parts.push(
      `1 0 0 1 ${placement.x.toFixed(2)} ${placement.y.toFixed(2)} Tm`,
      `/${placement.font} ${placement.size} Tf`,
      `(${toPdfText(placement.text)}) Tj`,
    );
  }
  parts.push('ET');
  return parts.join('\n');
}

/**
 * Render the lines as a PDF.
 *
 * ⚠️ THE OUTPUT IS ASCII, AND THAT IS WHAT MAKES THE LENGTHS AND OFFSETS CORRECT. Every offset and every
 * `/Length` in a PDF is a byte count, not a character count. `toPdfText` guarantees every character is in
 * 0x20–0x7E, where one character is one byte in both ASCII and UTF-8 — so the string this returns can be handed
 * straight to a `Response` as its body and land on the wire byte-for-byte. `assertAscii` is what keeps that
 * argument honest rather than assumed.
 */
export function buildPdf(lines: PdfLine[]): string {
  const streams = paginate(lines).map(contentStream);

  const objects: string[] = [];
  const kids = streams.map((_, index) => `${5 + index * 2} 0 R`).join(' ');

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${kids}] /Count ${streams.length} >>`;
  objects[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

  streams.forEach((stream, index) => {
    const pageObject = 5 + index * 2;
    const contentObject = pageObject + 1;
    objects[pageObject - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let document = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets[index] = document.length;
    document += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = document.length;
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    document += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return assertAscii(document);
}

/**
 * Fail loudly rather than emit a corrupt file. A single character above 0x7E would make every offset after it
 * wrong and every `/Length` short — a PDF that opens to a blank page is the good outcome of that mistake.
 */
function assertAscii(document: string): string {
  const offender = document.search(/[^\x20-\x7E\r\n\t]/);
  if (offender !== -1) {
    throw new Error(
      `PDF writer produced a non-ASCII character at ${offender} (${JSON.stringify(document.slice(offender, offender + 4))}); transliterate it in toPdfText.`,
    );
  }
  return document;
}

/** A `Content-Disposition` value that keeps the download name readable without allowing header injection. */
export function attachmentName(base: string, extension: string): string {
  const safe = base
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `attachment; filename="${safe || 'document'}.${extension}"`;
}

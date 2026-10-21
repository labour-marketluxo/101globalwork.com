/**
 * The words a document's type and access scope are shown as.
 *
 * ⚠️ SEPARATE FROM `files.ts` FOR THE CLIENT BOUNDARY. The upload form is a client component and needs these labels;
 * `files.ts` reads through the request-scoped Supabase client. Two lookup tables do not justify carrying
 * `next/headers` into the browser, so they live here and both sides import from here.
 */

export const DOCUMENT_TYPE_COPY: Record<string, string> = {
  agreement: 'Agreement',
  scope: 'Scope specification',
  receipt: 'Receipt',
  certificate: 'Compliance certificate',
  permit: 'Permit',
  insurance: 'Insurance',
  other: 'Other',
};

export const ACCESS_SCOPE_COPY: Record<string, string> = {
  participants: 'Both parties',
  provider_only: 'Provider only',
  customer_only: 'Customer only',
};

/**
 * Provider workspace paths and the vocabulary of its action list — a pure module, deliberately.
 *
 * The shell (a client component marking the current section) and the pages (server components
 * building links) both need these, and a module that imported the Supabase server client could not
 * cross into a client bundle. Same reasoning, and the same shape, as features/settings/paths.ts.
 *
 * ⚠️ `/provider` AND `/providers` DIFFER BY ONE CHARACTER, and the two must never be confused:
 * `/provider` is this signed-in operational workspace and `/providers/[slug]` is the public
 * directory of published profiles. A link built from the wrong one sends a provider to their own
 * marketing page.
 */

export const PROVIDER_PATHS = {
  today: '/provider',
  onboarding: '/provider/onboarding',
  profile: '/provider/profile',
  profilePreview: '/provider/profile/preview',
  verification: '/provider/verification',
  credentials: '/provider/credentials',
  searchReadiness: '/provider/search-readiness',
  earnings: '/provider/earnings',
  payouts: '/provider/earnings/payouts',
  earningsSummary: '/provider/earnings/summary',
  availability: '/provider/availability',
  work: '/provider/work',
  opportunities: '/provider/opportunities',
  quotesNew: '/provider/quotes/new',
  quotes: '/provider/quotes',
} as const;

/**
 * The action list's vocabulary.
 *
 * The database returns facts (`kind`, ids, a due date) and this maps them to a sentence and a
 * destination. Keeping the copy here rather than in `get_my_provider_day_command` means the wording
 * can change without a migration, and keeping it in ONE map means two components cannot describe the
 * same fact differently.
 */
export const PROVIDER_ACTION_COPY = {
  appointment_proposal: {
    title: 'A customer asked for a different time',
    tone: 'amber',
    /** Resolved against assignment_id when the entry is rendered. */
    target: 'assignment',
  },
  completion_correction: {
    title: 'Work was sent back for correction',
    tone: 'amber',
    target: 'assignment',
  },
  completion_evidence: {
    title: 'Work is in progress and needs completion evidence',
    tone: 'slate',
    target: 'assignment',
  },
  quote_change: {
    title: 'A customer asked about a quote',
    tone: 'amber',
    target: 'request',
  },
  credential_expiring: {
    title: 'A credential is expiring',
    tone: 'amber',
    target: 'credentials',
  },
  identity_verification: {
    title: 'Identity verification is not complete',
    tone: 'slate',
    target: 'verification',
  },
  payout_account: {
    title: 'No verified payout account',
    tone: 'amber',
    target: 'payouts',
  },
  profile_not_published: {
    title: 'Your public profile is not published',
    tone: 'slate',
    target: 'profile',
  },
} as const;

export type ProviderActionKind = keyof typeof PROVIDER_ACTION_COPY;

export function providerActionKind(value: unknown): ProviderActionKind | null {
  return typeof value === 'string' && value in PROVIDER_ACTION_COPY
    ? (value as ProviderActionKind)
    : null;
}

/**
 * Failure codes that may appear in `?failed=` on a workspace page.
 *
 * A fixed vocabulary for the same reason the sessions page has one: the parameter is user-editable,
 * and rendering whatever it contains inside an authenticated card is how a page becomes a phishing
 * surface.
 */
export const PROVIDER_FAILURE_CODES = [
  'not_authorized',
  'bad_request',
  'unavailable',
  'duplicate_credential',
  'duplicate_verification',
  'blackout',
] as const;

export type ProviderFailureCode = (typeof PROVIDER_FAILURE_CODES)[number];

export const PROVIDER_FAILURE_COPY: Record<ProviderFailureCode, string> = {
  not_authorized: 'That provider profile belongs to a different account, so nothing was changed.',
  bad_request: 'That request was missing something it needed. Nothing was changed.',
  unavailable:
    'The change could not be completed, so nothing was saved. Try again — if it keeps failing, this is a platform problem rather than something about your account.',
  duplicate_credential:
    'A credential of that type from that issuer is already on file. Add the renewal to the existing one instead, so the expiry date on the record is the one that applies.',
  duplicate_verification:
    'A verification of that kind is already on file for that jurisdiction. Open it and re-submit the document instead of starting a second one.',
  blackout:
    'That date falls inside a blackout you set on your availability page. Nothing was scheduled — change the date, or tick “book it anyway” if you meant to work that week.',
};

export function providerFailureCode(value: string | undefined | null): ProviderFailureCode | null {
  if (!value) return null;
  return (PROVIDER_FAILURE_CODES as readonly string[]).includes(value)
    ? (value as ProviderFailureCode)
    : null;
}

/**
 * Quoting has its own vocabulary, because its refusals are about a price rather than about an account, and
 * the sentence a provider needs is different in kind: "every line needs a description and an amount" is not
 * the same message as "that change did not go through".
 */
export const QUOTE_FAILURE_CODES = [
  'price',
  'summary',
  'validity',
  'taxes',
  'timeline',
  'terms',
  'eligibility',
  'locked',
  'failed',
] as const;

export type QuoteFailureCode = (typeof QUOTE_FAILURE_CODES)[number];

export const QUOTE_FAILURE_COPY: Record<QuoteFailureCode, string> = {
  price: 'Every line needs a description and an amount, and the total must be greater than zero.',
  summary: 'Describe what is included in at least 20 characters.',
  validity: 'Quote validity must be a future date and time.',
  taxes: 'Taxes and fees must be a whole amount of money, and they cannot be negative.',
  timeline: 'A timeline has to be a whole number of days greater than zero.',
  terms: 'One of the terms was too long. Keep each note under 2,000 characters.',
  eligibility:
    'This quote could not be submitted. Check the request, the price and the scope, and that your provider account is still eligible to quote — then try again.',
  locked:
    'That quote version is locked because the customer accepted it. An accepted price cannot be changed or withdrawn — send a revised quote for new work instead.',
  failed: 'That did not work and nothing was saved. Try again.',
};

export function quoteFailureCode(value: string | undefined | null): QuoteFailureCode | null {
  if (!value) return null;
  return (QUOTE_FAILURE_CODES as readonly string[]).includes(value) ? (value as QuoteFailureCode) : null;
}

/**
 * The publication checklist, as one ordered list.
 *
 * ⚠️ THIS IS THE AUTHORITATIVE GATE, NOT THE READINESS SCORE. `publish_provider_profile_authoritatively`
 * refuses to activate a provider without an active service, an active service area, a verified
 * identity and a readiness score at or above 60; the score is a consequence of the same facts. The
 * provider pages say so out loud, because "your score is 72" is not a statement about whether the
 * publish button will work.
 */
export const PROVIDER_PUBLISH_STEPS = [
  { key: 'identity', label: 'Business info', note: 'The public name customers will see.' },
  { key: 'services', label: 'Services & coverage', note: 'What you offer and where you can do it.' },
  { key: 'verification', label: 'Identity verification', note: 'Someone checks it once, by hand.' },
  { key: 'payout', label: 'Payout setup', note: 'Where cleared money is sent.' },
] as const;

export type ProviderPublishStepKey = (typeof PROVIDER_PUBLISH_STEPS)[number]['key'];

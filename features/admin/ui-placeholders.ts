/**
 * ⚠️ PLACEHOLDER DATA FOR A UI-ONLY BUILD. NONE OF THIS IS A READ.
 *
 * Every value below stands in for something a command or reader would return. Nothing here calls the database, and
 * nothing here should survive the wiring pass.
 *
 * ⚠️ WHY ONE MODULE AND NOT VALUES INLINE IN EACH PAGE. This repository's convention is that the console never shows
 * a number it cannot point at, so invented figures have to be obvious rather than scattered. Keeping them in one
 * file means the whole set is deleted in a single commit, and `grep -rn "ui-placeholders"` lists every page still
 * standing on demo data.
 *
 * ⚠️ EACH EXPORT NAMES THE THING IT REPLACES, so the wiring pass is a checklist rather than an investigation.
 */

/** Replaces the model routing rows a provider-route reader would return, ordered by fallback priority. */
export type AiRoutePlaceholder = {
  routeKey: string;
  provider: string;
  model: string;
  purpose: string;
  environment: 'production' | 'preview' | 'development';
  status: 'active' | 'paused' | 'retired';
  priority: number;
  monthlyQuotaUnits: number;
  unitsUsed: number;
  costPer1kMinor: number;
  averageLatencyMs: number;
  accepted: number;
  rejected: number;
  pausedReason: string | null;
};

export const aiRoutes: AiRoutePlaceholder[] = [
  {
    routeKey: 'request_triage.primary',
    provider: 'Anthropic',
    model: 'claude-sonnet-4',
    purpose: 'Summarise a customer request into a service category and urgency band',
    environment: 'production',
    status: 'active',
    priority: 1,
    monthlyQuotaUnits: 40000,
    unitsUsed: 26950,
    costPer1kMinor: 420,
    averageLatencyMs: 1840,
    accepted: 312,
    rejected: 41,
    pausedReason: null,
  },
  {
    routeKey: 'request_triage.fallback',
    provider: 'OpenAI',
    model: 'gpt-5-mini',
    purpose: 'Same purpose as the primary route, used when it is paused or over quota',
    environment: 'production',
    status: 'active',
    priority: 2,
    monthlyQuotaUnits: 20000,
    unitsUsed: 4210,
    costPer1kMinor: 180,
    averageLatencyMs: 940,
    accepted: 88,
    rejected: 9,
    pausedReason: null,
  },
  {
    routeKey: 'quote_draft_assist',
    provider: 'OpenAI',
    model: 'gpt-5',
    purpose: 'Draft a scope summary a provider can edit before sending a quotation',
    environment: 'production',
    status: 'paused',
    priority: 1,
    monthlyQuotaUnits: 8000,
    unitsUsed: 3110,
    costPer1kMinor: 610,
    averageLatencyMs: 2630,
    accepted: 54,
    rejected: 22,
    pausedReason: 'Quote wording drifted from the agreed template wording',
  },
  {
    routeKey: 'provider_review_assist',
    provider: 'Anthropic',
    model: 'claude-haiku-4',
    purpose: 'Summarise a credential document for a trust reviewer to check',
    environment: 'preview',
    status: 'active',
    priority: 1,
    monthlyQuotaUnits: 12000,
    unitsUsed: 640,
    costPer1kMinor: 95,
    averageLatencyMs: 720,
    accepted: 19,
    rejected: 3,
    pausedReason: null,
  },
];

/** Replaces a policy-version read. One active version per policy key. */
export type AiPolicyPlaceholder = {
  policyKey: string;
  version: number;
  status: 'draft' | 'active' | 'retired';
  purpose: string;
  routeKey: string;
  activatedAt: string | null;
  constraints: string[];
  notes: string | null;
};

export const aiPolicies: AiPolicyPlaceholder[] = [
  {
    policyKey: 'request_triage',
    version: 4,
    status: 'active',
    purpose: 'Classify a request before it reaches matching',
    routeKey: 'request_triage.primary',
    activatedAt: '2026-09-12T09:15:00Z',
    constraints: [
      'Output must name a canonical service id, never a free-text category',
      'Never suggests a price, a provider or a date',
      'Human review required before anything reaches a request record',
    ],
    notes: 'Widened the synonym list after the plumbing merge.',
  },
  {
    policyKey: 'request_triage',
    version: 5,
    status: 'draft',
    purpose: 'Classify a request before it reaches matching',
    routeKey: 'request_triage.primary',
    activatedAt: null,
    constraints: [
      'Output must name a canonical service id, never a free-text category',
      'Never suggests a price, a provider or a date',
      'Human review required before anything reaches a request record',
      'New: must return "unclear" rather than guessing below 0.6 confidence',
    ],
    notes: 'Awaiting a review of the unclear-output rule.',
  },
  {
    policyKey: 'provider_review',
    version: 2,
    status: 'active',
    purpose: 'Summarise uploaded credentials for a reviewer',
    routeKey: 'provider_review_assist',
    activatedAt: '2026-08-30T14:02:00Z',
    constraints: ['Never states that a credential is valid', 'Summarises only what the document says'],
    notes: null,
  },
];

/**
 * Replaces a trace read. Note the shape: no prompt, no completion — the same privacy bound the table carries, so the
 * UI cannot accidentally be built to expect them.
 */
export type AiTracePlaceholder = {
  id: string;
  routeKey: string;
  policyVersion: string;
  purpose: string;
  promptHash: string;
  promptChars: number;
  redactedSummary: string;
  latencyMs: number;
  costMinor: number;
  outcome: 'accepted' | 'rejected' | 'error' | 'dry_run';
  subject: string | null;
  at: string;
};

export const aiTraces: AiTracePlaceholder[] = [
  {
    id: 'a1f4c2e0-5d21-4a77-9d10-8a1c9b7e4412',
    routeKey: 'request_triage.primary',
    policyVersion: 'request_triage v4',
    purpose: 'Classify a request',
    promptHash: 'sha256:9f2c…41ab',
    promptChars: 412,
    redactedSummary: 'Request text and location; no contact details in the prompt',
    latencyMs: 1720,
    costMinor: 173,
    outcome: 'accepted',
    subject: 'request #4c19a0',
    at: '2026-09-23T08:41:12Z',
  },
  {
    id: 'b7d1e4a8-2c63-4d19-8f02-77b1c5a09dd3',
    routeKey: 'request_triage.primary',
    policyVersion: 'request_triage v4',
    purpose: 'Classify a request',
    promptHash: 'sha256:5be1…88cd',
    promptChars: 268,
    redactedSummary: 'Request text only; below the confidence floor so the proposal was refused',
    latencyMs: 1980,
    costMinor: 112,
    outcome: 'rejected',
    subject: 'request #91de77',
    at: '2026-09-23T08:39:04Z',
  },
  {
    id: 'c2a9b6f1-0e44-4b8a-a3d5-90f7e2b1c6aa',
    routeKey: 'request_triage.fallback',
    policyVersion: 'request_triage v4',
    purpose: 'Classify a request after the primary route timed out',
    promptHash: 'sha256:11ac…7f30',
    promptChars: 412,
    redactedSummary: 'Same prompt as the timed-out primary call',
    latencyMs: 880,
    costMinor: 74,
    outcome: 'accepted',
    subject: 'request #4c19a0',
    at: '2026-09-23T08:41:14Z',
  },
  {
    id: 'd8f3a711-9b2e-4c05-9e6b-2d4f8a1b7c22',
    routeKey: 'quote_draft_assist',
    policyVersion: 'quote_draft v3',
    purpose: 'Draft a quote summary',
    promptHash: 'sha256:7d40…1ba9',
    promptChars: 1804,
    redactedSummary: 'Scope snapshot only; the provider cancelled the draft',
    latencyMs: 3110,
    costMinor: 486,
    outcome: 'rejected',
    subject: 'quote #77b2e1',
    at: '2026-09-22T17:12:48Z',
  },
  {
    id: 'e5c07b93-3f18-4a6d-8c27-6b9d1e4f5a80',
    routeKey: 'provider_review_assist',
    policyVersion: 'provider_review v2',
    purpose: 'Summarise a credential document',
    promptHash: 'sha256:2ef8…6c14',
    promptChars: 0,
    redactedSummary: 'Dry run: no document was sent and no provider was called',
    latencyMs: 0,
    costMinor: 0,
    outcome: 'dry_run',
    subject: 'credential #a3f7c9',
    at: '2026-09-22T15:03:20Z',
  },
];

/** Replaces a proposal read — everything a model suggested that a person has not decided yet. */
export type AiProposalPlaceholder = {
  id: string;
  actionKind: string;
  target: string;
  proposedPayload: string;
  status: 'proposed' | 'accepted' | 'rejected' | 'expired';
  policyVersion: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export const aiProposals: AiProposalPlaceholder[] = [
  {
    id: 'p-8841',
    actionKind: 'Set request service category',
    target: 'request #4c19a0',
    proposedPayload: 'service: plumbing_residential · confidence 0.81',
    status: 'proposed',
    policyVersion: 'request_triage v4',
    decidedBy: null,
    decidedAt: null,
    createdAt: '2026-09-23T08:41:12Z',
  },
  {
    id: 'p-8838',
    actionKind: 'Suggest urgency band',
    target: 'request #91de77',
    proposedPayload: 'urgency: soon · confidence 0.54 (below the floor)',
    status: 'rejected',
    policyVersion: 'request_triage v4',
    decidedBy: 'Amina Oyelaran',
    decidedAt: '2026-09-23T08:44:10Z',
    createdAt: '2026-09-23T08:39:04Z',
  },
  {
    id: 'p-8820',
    actionKind: 'Draft quote scope summary',
    target: 'quote #77b2e1',
    proposedPayload: 'A 3-line summary the provider can edit before sending',
    status: 'accepted',
    policyVersion: 'quote_draft v3',
    decidedBy: 'Tunde Balogun',
    decidedAt: '2026-09-22T17:20:02Z',
    createdAt: '2026-09-22T17:12:48Z',
  },
];

/** Replaces the audit-event search a reader would return, including the before/after a decision recorded. */
export type AuditEventPlaceholder = {
  id: string;
  actorName: string;
  actorRole: string;
  actorType: string;
  action: string;
  resourceType: string;
  resourceRef: string;
  reasonCode: string | null;
  before: string | null;
  after: string | null;
  correlationId: string | null;
  at: string;
  timezone: string;
};

export const auditEvents: AuditEventPlaceholder[] = [
  {
    id: 'e-55910',
    actorName: 'Amina Oyelaran',
    actorRole: 'Trust & Safety',
    actorType: 'user',
    action: 'PROVIDER_VERIFICATION_APPROVED',
    resourceType: 'provider_verification',
    resourceRef: 'verification #3ac9…e1',
    reasonCode: 'document_matches_claim',
    before: 'status: pending',
    after: 'status: verified · expires 2027-09-23',
    correlationId: 'req-9f21b8',
    at: '2026-09-23T09:02:41Z',
    timezone: 'Africa/Lagos (UTC+01:00)',
  },
  {
    id: 'e-55908',
    actorName: 'Tunde Balogun',
    actorRole: 'Finance',
    actorType: 'user',
    action: 'ACCOUNT_STANDING_CHANGED',
    resourceType: 'account',
    resourceRef: 'account #7d10…4b',
    reasonCode: 'suspected_compromise',
    before: 'status: active',
    after: 'status: suspended · sessions ended',
    correlationId: null,
    at: '2026-09-23T08:58:03Z',
    timezone: 'Africa/Lagos (UTC+01:00)',
  },
  {
    id: 'e-55899',
    actorName: 'System',
    actorRole: 'system',
    actorType: 'system',
    action: 'PAYMENT_RECONCILED',
    resourceType: 'payment_obligation',
    resourceRef: 'obligation #b2f7…09',
    reasonCode: null,
    before: 'status: funding',
    after: 'status: funded',
    correlationId: 'evt-71c0aa',
    at: '2026-09-23T07:44:19Z',
    timezone: 'Africa/Lagos (UTC+01:00)',
  },
  {
    id: 'e-55881',
    actorName: 'Grace Adeyemi',
    actorRole: 'Operations',
    actorType: 'user',
    action: 'PROJECT_STATE_FORCED',
    resourceType: 'request',
    resourceRef: 'request #4c19a0',
    reasonCode: 'support_ticket',
    before: 'state: submitted_for_approval',
    after: 'state: completed',
    correlationId: 'SUP-4821',
    at: '2026-09-22T21:10:55Z',
    timezone: 'Africa/Lagos (UTC+01:00)',
  },
];

/** Replaces the audit-access log: who read this console, with what query and reason. */
export type AuditAccessPlaceholder = {
  id: string;
  actorName: string;
  accessKind: 'search' | 'view' | 'lineage' | 'export';
  query: string;
  rowsReturned: number;
  reasonCode: string;
  at: string;
};

export const auditAccessLog: AuditAccessPlaceholder[] = [
  { id: 'v-2210', actorName: 'Amina Oyelaran', accessKind: 'search', query: 'action: PROVIDER_VERIFICATION_*  ·  last 7 days', rowsReturned: 18, reasonCode: 'trust_review', at: '2026-09-23T09:03:10Z' },
  { id: 'v-2209', actorName: 'Amina Oyelaran', accessKind: 'view', query: 'event #3ac9…e1', rowsReturned: 1, reasonCode: 'trust_review', at: '2026-09-23T09:03:22Z' },
  { id: 'v-2204', actorName: 'Tunde Balogun', accessKind: 'export', query: 'resource: account #7d10…4b  ·  last 30 days', rowsReturned: 64, reasonCode: 'finance_review', at: '2026-09-23T08:59:41Z' },
  { id: 'v-2198', actorName: 'Grace Adeyemi', accessKind: 'lineage', query: 'request #4c19a0', rowsReturned: 23, reasonCode: 'incident_review', at: '2026-09-22T21:14:02Z' },
];

// ── Search presence, routes, redirects and sitemaps ────────────────────────────────────────────

/** Replaces the SEO health read. Note `analyticsAvailable`: the platform stores no visit data at all. */
export const searchPresence = {
  analyticsAvailable: false,
  analyticsNote:
    'The platform stores no visit, referrer or session data, so there is no organic conversion funnel to report. Every figure on this screen comes from the route table and its evaluations.',
  counts: {
    routes: 486,
    indexable: 312,
    noindex: 174,
    withSupplyGap: 41,
    withContentGap: 96,
    canonicalMissing: 12,
    canonicalPointer: 58,
    schemaMissing: 77,
    redirects: 63,
    staleEvaluations: 28,
  },
  sitemapFreshness: {
    lastGeneratedAt: '2026-09-23T05:00:00Z',
    lastRouteChangeAt: '2026-09-23T07:44:00Z',
    note: 'The XML is generated on request by the application; the console shows the inputs and when they last moved.',
  },
  hreflang: [
    { language: 'en', coverage: 312, markets: ['NG'] },
    { language: 'fr', coverage: 74, markets: ['NG'] },
    { language: 'ha', coverage: 38, markets: ['NG'] },
    { language: 'yo', coverage: 21, markets: ['NG'] },
  ],
  markets: [
    { marketId: 'm-ng', code: 'NG', name: 'Nigeria', routes: 462, indexable: 301, lastEvaluatedAt: '2026-09-23T04:50:00Z' },
    { marketId: 'm-gh', code: 'GH', name: 'Ghana', routes: 24, indexable: 11, lastEvaluatedAt: '2026-09-22T22:10:00Z' },
  ],
  recentAudits: [
    { id: 'aud-1180', ranBy: 'Grace Adeyemi', routesEvaluated: 486, changedState: 17, at: '2026-09-23T04:50:00Z' },
    { id: 'aud-1174', ranBy: 'System', routesEvaluated: 486, changedState: 4, at: '2026-09-22T04:50:00Z' },
  ],
};

/** Replaces a single-route read. One row per inspected page. */
export type SearchPagePlaceholder = {
  id: string;
  canonicalPath: string;
  slug: string;
  entityKind: 'service' | 'problem' | 'outcome' | 'provider';
  entityRef: string;
  marketCode: string;
  indexability: 'indexable' | 'noindex_follow' | 'insufficient_supply' | 'insufficient_content';
  canonicalUrl: string;
  canonicalOf: string | null;
  qualityScore: number;
  depth: number;
  inboundLinks: number;
  title: string;
  metaDescription: string;
  structuredData: string;
  schemaValid: boolean;
  schemaErrors: string[];
  noindexReasons: string[];
  updatedAt: string;
};

export const searchPages: SearchPagePlaceholder[] = [
  {
    id: 'r-4f21',
    canonicalPath: '/ng/abuja/plumbing/tap-repair',
    slug: 'tap-repair',
    entityKind: 'service',
    entityRef: 'service plumbing_residential · outcome tap_repair',
    marketCode: 'NG',
    indexability: 'indexable',
    canonicalUrl: 'https://101globalwork.com/ng/abuja/plumbing/tap-repair',
    canonicalOf: null,
    qualityScore: 82,
    depth: 4,
    inboundLinks: 11,
    title: 'Tap repair in Abuja · verified plumbers | 101GlobalWork',
    metaDescription:
      'Compare verified plumbers for tap repair in Abuja. See who is available, what they have verified, and request a quote.',
    structuredData: 'Service + Offer catalog + BreadcrumbList',
    schemaValid: true,
    schemaErrors: [],
    noindexReasons: [],
    updatedAt: '2026-09-22T11:20:00Z',
  },
  {
    id: 'r-7788',
    canonicalPath: '/ng/gwarinpa/tailoring/alterations',
    slug: 'alterations',
    entityKind: 'service',
    entityRef: 'service tailoring · outcome garment_alteration',
    marketCode: 'NG',
    indexability: 'noindex_follow',
    canonicalUrl: 'https://101globalwork.com/ng/gwarinpa/tailoring/alterations',
    canonicalOf: '/ng/abuja/tailoring/alterations',
    qualityScore: 61,
    depth: 4,
    inboundLinks: 3,
    title: 'Garment alterations in Gwarinpa | 101GlobalWork',
    metaDescription: 'Alterations by local tailors in Gwarinpa.',
    structuredData: 'Service (incomplete)',
    schemaValid: false,
    schemaErrors: [
      'Missing required property "areaServed"',
      'Provider count below the page threshold, so the offer catalog is empty',
    ],
    noindexReasons: [
      'The locality is covered by a canonical page in its parent area',
      'Only 2 eligible providers within the travel band',
    ],
    updatedAt: '2026-09-21T16:05:00Z',
  },
  {
    id: 'r-9021',
    canonicalPath: '/ng/abuja/plumbing/burst-pipe',
    slug: 'burst-pipe',
    entityKind: 'service',
    entityRef: 'service plumbing_residential · outcome burst_pipe',
    marketCode: 'NG',
    indexability: 'insufficient_supply',
    canonicalUrl: 'https://101globalwork.com/ng/abuja/plumbing/burst-pipe',
    canonicalOf: null,
    qualityScore: 44,
    depth: 4,
    inboundLinks: 1,
    title: 'Burst pipe repair in Abuja | 101GlobalWork',
    metaDescription: 'Emergency burst pipe repair in Abuja.',
    structuredData: 'Service',
    schemaValid: false,
    schemaErrors: ['Missing required property "areaServed"'],
    noindexReasons: [
      'Only 1 eligible provider, below the three-provider minimum for this page type',
    ],
    updatedAt: '2026-09-20T09:41:00Z',
  },
];

/** Replaces the redirect registry read, including the chain analysis the command refuses on write. */
export type RedirectPlaceholder = {
  id: string;
  fromPath: string;
  toPath: string;
  status: 301 | 308;
  targetEntityRef: string;
  createdAt: string;
  reasonCode: string | null;
  disabledAt: string | null;
  chainsInto: string | null;
};

export const redirects: RedirectPlaceholder[] = [
  {
    id: 'rd-441',
    fromPath: '/ng/abuja/plumbing/leaking-tap',
    toPath: '/ng/abuja/plumbing/tap-repair',
    status: 301,
    targetEntityRef: 'service plumbing_residential · outcome tap_repair',
    createdAt: '2026-09-22T11:25:00Z',
    reasonCode: 'canonical_fix',
    disabledAt: null,
    chainsInto: null,
  },
  {
    id: 'rd-438',
    fromPath: '/ng/abuja/tailoring/repairs',
    toPath: '/ng/gwarinpa/tailoring/alterations',
    status: 301,
    targetEntityRef: 'service tailoring · outcome garment_alteration',
    createdAt: '2026-09-21T16:10:00Z',
    reasonCode: 'metadata_fix',
    disabledAt: null,
    chainsInto: null,
  },
  {
    id: 'rd-402',
    fromPath: '/ng/gwarinpa/tailoring/mending',
    toPath: '/ng/abuja/tailoring/repairs',
    status: 301,
    targetEntityRef: 'service tailoring · outcome garment_alteration',
    createdAt: '2026-09-04T10:02:00Z',
    reasonCode: 'canonical_fix',
    disabledAt: null,
    chainsInto: '/ng/abuja/tailoring/repairs',
  },
  {
    id: 'rd-377',
    fromPath: '/ng/abuja/plumbing/general',
    toPath: '/ng/abuja/plumbing',
    status: 308,
    targetEntityRef: 'service plumbing_residential',
    createdAt: '2026-08-19T08:30:00Z',
    reasonCode: 'entity_retired',
    disabledAt: '2026-09-02T12:00:00Z',
    chainsInto: null,
  },
];

/** Replaces the sitemap inputs read. One row per market index. */
export type SitemapPlaceholder = {
  marketId: string;
  code: string;
  name: string;
  indexUrl: string;
  indexableUrls: number;
  excludedUrls: number;
  lastGeneratedAt: string;
  lastSubmittedAt: string | null;
  submissionStatus: 'not submitted' | 'submitted' | 'accepted' | 'warnings';
  lastRouteChangeAt: string;
  schemaErrors: { path: string; detail: string }[];
};

export const sitemaps: SitemapPlaceholder[] = [
  {
    marketId: 'm-ng',
    code: 'NG',
    name: 'Nigeria',
    indexUrl: '/sitemap.xml?market=NG',
    indexableUrls: 301,
    excludedUrls: 161,
    lastGeneratedAt: '2026-09-23T05:00:00Z',
    lastSubmittedAt: '2026-09-22T05:10:00Z',
    submissionStatus: 'accepted',
    lastRouteChangeAt: '2026-09-23T07:44:00Z',
    schemaErrors: [
      { path: '/ng/abuja/plumbing/burst-pipe', detail: 'JSON-LD missing required property "areaServed"' },
      { path: '/ng/gwarinpa/tailoring/alterations', detail: 'JSON-LD offer catalog is empty' },
    ],
  },
  {
    marketId: 'm-gh',
    code: 'GH',
    name: 'Ghana',
    indexUrl: '/sitemap.xml?market=GH',
    indexableUrls: 11,
    excludedUrls: 13,
    lastGeneratedAt: '2026-09-23T05:00:00Z',
    lastSubmittedAt: null,
    submissionStatus: 'not submitted',
    lastRouteChangeAt: '2026-09-22T22:12:00Z',
    schemaErrors: [],
  },
];

export const sitemapGenerationLog = [
  { id: 'gen-990', startedAt: '2026-09-23T05:00:00Z', finishedAt: '2026-09-23T05:00:41Z', urls: 312, markets: 2, result: 'ok' as const, detail: null },
  { id: 'gen-988', startedAt: '2026-09-22T05:00:00Z', finishedAt: '2026-09-22T05:00:38Z', urls: 309, markets: 2, result: 'ok' as const, detail: null },
  { id: 'gen-986', startedAt: '2026-09-21T05:00:00Z', finishedAt: '2026-09-21T05:01:02Z', urls: 303, markets: 2, result: 'warnings' as const, detail: 'Two routes were skipped: their structured data did not parse.' },
];

// ── Operations: flags and incidents ────────────────────────────────────────────────────────────

/** Replaces the feature-flag read. `guardsAuthoritativeData` is the release-safety rule made checkable. */
export type FeatureFlagPlaceholder = {
  id: string;
  key: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'rolled_back' | 'retired';
  cohortPercent: number;
  environment: 'development' | 'preview' | 'production';
  guardsAuthoritativeData: boolean;
  owner: string;
  updatedAt: string;
  events: { action: string; note: string; actor: string; at: string; reasonCode: string }[];
};

export const featureFlags: FeatureFlagPlaceholder[] = [
  {
    id: 'fl-31',
    key: 'quotes.builder_v2',
    name: 'Quote builder v2',
    description: 'New line-item editor for provider quotations. Client-side totals only; the server still recalculates.',
    status: 'active',
    cohortPercent: 25,
    environment: 'production',
    guardsAuthoritativeData: false,
    owner: 'Tunde Balogun',
    updatedAt: '2026-09-22T14:20:00Z',
    events: [
      { action: 'cohort_changed', note: 'Raised from 10% to 25% after a clean week.', actor: 'Tunde Balogun', at: '2026-09-22T14:20:00Z', reasonCode: 'staged_rollout' },
      { action: 'created', note: 'Initial rollout to the internal cohort.', actor: 'Tunde Balogun', at: '2026-09-15T09:00:00Z', reasonCode: 'beta_cohort' },
    ],
  },
  {
    id: 'fl-28',
    key: 'dispatch.travel_band_v2',
    name: 'Travel band v2',
    description: 'Widens the travel band a provider is matched on, from a fixed radius to a corridor.',
    status: 'rolled_back',
    cohortPercent: 0,
    environment: 'production',
    guardsAuthoritativeData: true,
    owner: 'Grace Adeyemi',
    updatedAt: '2026-09-20T18:45:00Z',
    events: [
      { action: 'rolled_back', note: 'Reverted: matching produced different eligible sets between cohorts.', actor: 'Grace Adeyemi', at: '2026-09-20T18:45:00Z', reasonCode: 'rollback' },
      { action: 'cohort_changed', note: 'Raised to 50% to compare match rates.', actor: 'Grace Adeyemi', at: '2026-09-19T10:00:00Z', reasonCode: 'staged_rollout' },
    ],
  },
  {
    id: 'fl-24',
    key: 'search.structured_data_offer',
    name: 'Offer catalog in structured data',
    description: 'Emits an offer catalog alongside the Service schema on locality pages.',
    status: 'paused',
    cohortPercent: 100,
    environment: 'preview',
    guardsAuthoritativeData: false,
    owner: 'Amina Oyelaran',
    updatedAt: '2026-09-21T11:05:00Z',
    events: [
      { action: 'paused', note: 'Paused until the empty offer catalog case is handled.', actor: 'Amina Oyelaran', at: '2026-09-21T11:05:00Z', reasonCode: 'incident_mitigation' },
    ],
  },
  {
    id: 'fl-19',
    key: 'payments.checkout_retry',
    name: 'Checkout retry',
    description: 'Offers a retry after a failed card attempt, reusing the same obligation.',
    status: 'active',
    cohortPercent: 100,
    environment: 'production',
    guardsAuthoritativeData: true,
    owner: 'Tunde Balogun',
    updatedAt: '2026-08-30T08:00:00Z',
    events: [
      { action: 'created', note: 'Fully released; the obligation is reused either way.', actor: 'Tunde Balogun', at: '2026-08-30T08:00:00Z', reasonCode: 'staged_rollout' },
    ],
  },
];

/** Replaces the incident read: the thing people declare, own and close, with its alert queue. */
export type IncidentPlaceholder = {
  id: string;
  title: string;
  area: 'platform' | 'payments' | 'search' | 'trust' | 'delivery' | 'third_party' | 'data';
  severity: 'low' | 'medium' | 'high' | 'critical';
  state: 'open' | 'investigating' | 'mitigating' | 'monitoring' | 'resolved' | 'closed';
  summary: string;
  runbookReference: string | null;
  thirdParty: string | null;
  lead: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  trustCaseRef: string | null;
  moneyCaseRef: string | null;
  resolution: string | null;
  openedAt: string;
  events: { action: string; note: string; actor: string; at: string; reasonCode: string }[];
};

export const incidents: IncidentPlaceholder[] = [
  {
    id: 'inc-204',
    title: 'Card payments degraded for one provider route',
    area: 'payments',
    severity: 'high',
    state: 'mitigating',
    summary:
      'Checkout attempts through one card route are failing intermittently. The obligations are untouched: no customer has been charged twice and no payout is affected.',
    runbookReference: 'RUNBOOK-payments-route-failure',
    thirdParty: 'Paystack',
    lead: 'Tunde Balogun',
    acknowledgedBy: 'Grace Adeyemi',
    acknowledgedAt: '2026-09-23T06:12:00Z',
    trustCaseRef: null,
    moneyCaseRef: 'obligation #b2f7…09',
    resolution: null,
    openedAt: '2026-09-23T06:05:00Z',
    events: [
      { action: 'state_changed', note: 'Moved to mitigating while the provider retries.', actor: 'Tunde Balogun', at: '2026-09-23T06:40:00Z', reasonCode: 'mitigated' },
      { action: 'lead_assigned', note: 'Finance took the lead; the provider contact is engaged.', actor: 'Grace Adeyemi', at: '2026-09-23T06:20:00Z', reasonCode: 'triaged' },
      { action: 'acknowledged', note: 'Alert acknowledged; no customer-visible effect confirmed yet.', actor: 'Grace Adeyemi', at: '2026-09-23T06:12:00Z', reasonCode: 'triaged' },
    ],
  },
  {
    id: 'inc-201',
    title: 'Search evaluations behind by six hours',
    area: 'search',
    severity: 'medium',
    state: 'monitoring',
    summary:
      'Route evaluations stopped running after a deploy. Indexability states are stale rather than wrong; nothing has been deindexed.',
    runbookReference: 'RUNBOOK-search-evaluation-lag',
    thirdParty: null,
    lead: 'Amina Oyelaran',
    acknowledgedBy: 'Amina Oyelaran',
    acknowledgedAt: '2026-09-22T23:40:00Z',
    trustCaseRef: null,
    moneyCaseRef: null,
    resolution: null,
    openedAt: '2026-09-22T23:30:00Z',
    events: [
      { action: 'state_changed', note: 'Evaluations caught up; watching one more cycle.', actor: 'Amina Oyelaran', at: '2026-09-23T05:20:00Z', reasonCode: 'monitoring' },
      { action: 'acknowledged', note: 'Alert acknowledged, runbook followed.', actor: 'Amina Oyelaran', at: '2026-09-22T23:40:00Z', reasonCode: 'triaged' },
    ],
  },
];

export const incidentAlerts = [
  {
    id: 'al-7712',
    headline: 'Payment route error rate above 5% for 10 minutes',
    source: 'payments adapter monitor',
    severity: 'high' as const,
    raisedAt: '2026-09-23T06:05:00Z',
    incidentId: 'inc-204',
  },
  {
    id: 'al-7706',
    headline: 'Outbox events waiting with zero delivery attempts',
    source: 'domain event publisher',
    severity: 'medium' as const,
    raisedAt: '2026-09-23T03:15:00Z',
    incidentId: null,
  },
  {
    id: 'al-7699',
    headline: 'Sitemap generation finished with warnings',
    source: 'sitemap builder',
    severity: 'low' as const,
    raisedAt: '2026-09-21T05:01:00Z',
    incidentId: null,
  },
];

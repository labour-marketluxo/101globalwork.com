import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isUiPreview } from '@/lib/ui-preview';

/**
 * MOCK MODE — a temporary, in-process stand-in for Supabase.
 *
 * ⚠️ IT IS ENVIRONMENT-GATED. `IS_MOCK_MODE` below is `isUiPreview` from lib/ui-preview.ts:
 * NODE_ENV must be `development` AND `NEXT_PUBLIC_ENABLE_UI_PREVIEW` must be `true` (set in
 * `.env.local`). `next build` and `next start` run with NODE_ENV=production, so this cannot turn
 * on in staging or production even if the variable is present in the build environment.
 *
 * WHAT IT DOES. `createSupabaseServerClient`, `createSupabaseBrowserClient`,
 * `createSupabaseServiceClient` and the session middleware all return this client instead of
 * talking to GoTrue/PostgREST, so the UI can be exercised with no network and no environment
 * variables:
 *
 *   auth      getUser/getSession always resolve a signed-in dummy user, the auth listener fires
 *             SIGNED_IN immediately, and every sign-in/sign-up/OTP/OAuth call succeeds.
 *   from()    table queries resolve locally. `accounts` and `profiles` get one fallback row so the
 *             workspace chrome and the customer dashboard render; every other table returns an
 *             empty array (or null for `.single()`/`.maybeSingle()`) instead of a network error.
 *   rpc()     resolves `null` data with no error, which lands most feature pages on their existing
 *             empty/not-found states rather than throwing.
 *   storage   upload/remove/signed-URL calls succeed against no real bucket.
 *
 * WHAT IT IS NOT. This is a UI-development bypass, not a security model: with it on, every visitor
 * appears authenticated as the dummy user. The NODE_ENV half of the gate is what keeps that out of
 * a production build; the env var is what keeps it out of an unopted-in dev machine.
 * `IS_MOCK_MODE` is a plain `boolean` so TypeScript keeps the live branches reachable.
 */

export const IS_MOCK_MODE: boolean = isUiPreview;

/** Where a mocked sign-in/sign-up lands when the form did not name a destination. */
export const MOCK_DASHBOARD_PATH = '/app/customer';

export const MOCK_USER_ID = 'mock-user-123';
export const MOCK_ACCOUNT_ID = 'mock-account-123';
export const MOCK_PROVIDER_ID = 'mock-provider-123';
export const MOCK_MARKET_ID = 'mock-market-ng';

const EPOCH = new Date(0).toISOString();

/**
 * Preview dates are relative to the moment this module loads, so the schedule is always "today" and
 * the history is always plausibly behind it. A fixed date would make the dashboard look abandoned the
 * week after it was written.
 */
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
/** A calendar date, for the columns that store `date` rather than `timestamptz`. */
const dateIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export const MOCK_ASSIGNMENT_ID = 'mock-assignment-1';
export const MOCK_SECOND_ASSIGNMENT_ID = 'mock-assignment-2';
export const MOCK_REQUEST_ID = 'mock-request-1';
export const MOCK_SECOND_REQUEST_ID = 'mock-request-2';
export const MOCK_THIRD_REQUEST_ID = 'mock-request-3';
export const MOCK_QUOTE_ID = 'mock-quote-1';

export const MOCK_USER = {
  id: MOCK_USER_ID,
  email: 'test@101globalwork.com',
  phone: '',
  role: 'authenticated',
  aud: 'authenticated',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { display_name: 'Mock User', signup_intent: 'customer' },
  identities: [],
  created_at: EPOCH,
  updated_at: EPOCH,
  confirmed_at: EPOCH,
  email_confirmed_at: EPOCH,
  last_sign_in_at: EPOCH,
} as unknown as User;

export const MOCK_SESSION = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  token_type: 'bearer',
  expires_in: 400 * 24 * 60 * 60,
  expires_at: Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60,
  user: MOCK_USER,
};

const OK = { status: 200, statusText: 'OK' } as const;

/**
 * Local rows for the tables preview mode has to satisfy. A list query resolves the whole set; a
 * `.single()`/`.maybeSingle()` resolves the first row.
 *
 * ⚠️ THE BUILDER IGNORES FILTERS, AND THAT IS THE POINT HERE. `getMarket('ng')` runs
 * `.ilike('code', slug).maybeSingle()`; because no filter is applied, the preview resolves the same
 * market for ANY slug, so typing `/anything/services` renders the directory instead of redirecting to
 * `/`. The same is true for ids on the other seeded tables. Everything not listed is still empty.
 */
const MOCK_TABLE_ROWS: Record<string, Record<string, unknown>[]> = {
  accounts: [
    {
      id: MOCK_ACCOUNT_ID,
      auth_user_id: MOCK_USER_ID,
      display_name: 'Mock User',
      status: 'active',
      created_at: EPOCH,
    },
  ],
  profiles: [
    {
      id: MOCK_USER_ID,
      display_name: 'Mock User',
      avatar_url: null,
      created_at: EPOCH,
    },
  ],
  /**
   * One active provider profile on the mock account. Without it every /provider/* page redirects to
   * /provider/onboarding (the guard exists for accounts that have not set one up yet), so the whole
   * provider workspace was unreachable in preview mode. No public profile row is seeded with it, so
   * the workspace shows its "not published yet" affordances and market search is left alone.
   *
   * ⚠️ `status: 'draft'`, NOT `'active'`, AND THE TWO HALVES HAVE TO AGREE. The rail offers "Setup"
   * whenever the profile is not public, but /provider/onboarding sends an *active* provider straight
   * back to the dashboard — so an active-but-unpublished row made the one link the rail advertised
   * bounce somewhere else. `'draft'` is the state that matches "not published yet", and it is also
   * what lets the whole setup flow be walked through in preview mode.
   */
  providers: [
    {
      id: MOCK_PROVIDER_ID,
      owner_account_id: MOCK_ACCOUNT_ID,
      display_name: 'Mock Provider Co',
      status: 'draft',
      created_at: EPOCH,
    },
  ],
  /**
   * The provider's own setup rows. `is_public: false` with no `published_at` is deliberate: the
   * workspace is previewed in its "not published yet" state, which is the state that shows the Setup
   * step, the readiness nudges and the publish affordance. Everything else is filled in so the
   * profile, credentials, verification, availability and payouts screens have real content to render.
   */
  provider_public_profiles: [
    {
      provider_id: MOCK_PROVIDER_ID,
      slug: 'mock-provider-co',
      headline: 'Plumbing, electrical and cooling for homes across Abuja',
      public_description:
        'A two-van team covering Gwarinpa, Wuse and the districts between them. We quote before we start, and we leave the site clean.',
      years_experience: 9,
      accepts_new_work: true,
      operating_hours: {
        mon: { open: '08:00', close: '18:00' },
        tue: { open: '08:00', close: '18:00' },
        wed: { open: '08:00', close: '18:00' },
        thu: { open: '08:00', close: '18:00' },
        fri: { open: '08:00', close: '18:00' },
        sat: { open: '09:00', close: '15:00' },
      },
      languages: ['en'],
      coverage_radius_km: 25,
      is_public: false,
      published_at: null,
    },
  ],
  provider_services: [
    { id: 'mock-provider-service-1', provider_id: MOCK_PROVIDER_ID, service_entity_id: 'mock-service-plumbing', is_primary: true, is_active: true },
    { id: 'mock-provider-service-2', provider_id: MOCK_PROVIDER_ID, service_entity_id: 'mock-service-electrical', is_primary: false, is_active: true },
    { id: 'mock-provider-service-3', provider_id: MOCK_PROVIDER_ID, service_entity_id: 'mock-service-hvac', is_primary: false, is_active: false },
  ],
  provider_service_areas: [
    { id: 'mock-provider-area-1', provider_id: MOCK_PROVIDER_ID, location_id: 'mock-location-gwarinpa', is_primary: true, is_active: true },
    { id: 'mock-provider-area-2', provider_id: MOCK_PROVIDER_ID, location_id: 'mock-location-abuja', is_primary: false, is_active: true },
  ],
  provider_credentials: [
    {
      id: 'mock-credential-1',
      provider_id: MOCK_PROVIDER_ID,
      credential_type: 'trade_licence',
      issuing_body: 'Abuja Municipal Area Council',
      jurisdiction_code: 'NG-FC',
      reference_label: 'AMAC/PL/2024/1187',
      expires_at: dateIn(21),
      service_entity_ids: ['mock-service-plumbing'],
      document_reference: 'trade-licence.pdf',
      status: 'verified',
      submitted_at: daysAgo(20),
      reviewed_at: daysAgo(18),
      review_note: null,
    },
    {
      id: 'mock-credential-2',
      provider_id: MOCK_PROVIDER_ID,
      credential_type: 'insurance',
      issuing_body: 'Leadway Assurance',
      jurisdiction_code: 'NG',
      reference_label: 'LW-PL-88213',
      expires_at: dateIn(300),
      service_entity_ids: [],
      document_reference: 'public-liability.pdf',
      status: 'submitted',
      submitted_at: daysAgo(3),
      reviewed_at: null,
      review_note: null,
    },
  ],
  provider_verifications: [
    {
      id: 'mock-verification-1',
      provider_id: MOCK_PROVIDER_ID,
      kind: 'identity',
      status: 'submitted',
      jurisdiction_code: 'NG',
      reference_label: 'NIN ending 2210',
      metadata: {},
      created_at: daysAgo(5),
      reviewed_at: null,
      verified_at: null,
      expires_at: null,
    },
  ],
  provider_search_readiness: [
    {
      provider_id: MOCK_PROVIDER_ID,
      identity_score: 30,
      service_score: 16,
      location_score: 10,
      trust_score: 8,
      content_score: 5,
      operations_score: 3,
      total_score: 72,
      readiness: 'needs_attention',
      reasons: [
        'Publish the profile to become eligible for indexing.',
        'Add a verified credential for Electrical Systems.',
      ],
      evaluated_at: daysAgo(1),
    },
  ],
  provider_payout_destinations: [
    {
      id: 'mock-destination-1',
      provider_id: MOCK_PROVIDER_ID,
      adapter_key: 'paystack',
      destination_type: 'bank_account',
      currency_code: 'NGN',
      bank_code: '058',
      account_last4: '4417',
      account_name: 'Mock Provider Co',
      provider_recipient_code: 'RCP_mock_0001',
      verification_status: 'verified',
      is_default: true,
      created_at: daysAgo(30),
      updated_at: daysAgo(30),
    },
  ],
  provider_blackout_dates: [
    {
      id: 'mock-blackout-1',
      provider_id: MOCK_PROVIDER_ID,
      starts_on: dateIn(14),
      ends_on: dateIn(18),
      reason: 'Annual leave',
      created_at: daysAgo(10),
    },
  ],
  provider_availability_settings: [
    {
      provider_id: MOCK_PROVIDER_ID,
      travel_notes: 'A call-out fee applies beyond 20km from Gwarinpa.',
      paused_until: null,
      pause_reason: null,
      updated_at: daysAgo(7),
    },
  ],
  provider_portfolio_items: [
    {
      id: 'mock-portfolio-1',
      provider_id: MOCK_PROVIDER_ID,
      title: 'Full bathroom re-pipe',
      description: 'Replaced the supply and waste runs in a 1990s terrace.',
      link_url: null,
      service_entity_id: 'mock-service-plumbing',
      is_public: true,
      created_at: daysAgo(60),
    },
  ],
  /** One market is enough: the builder ignores the slug filter, so every market path resolves. */
  public_market_catalog: [
    {
      market_id: MOCK_MARKET_ID,
      code: 'NG',
      display_name: 'Nigeria',
      default_language_code: 'en',
      default_currency_code: 'NGN',
    },
  ],
  /**
   * The hierarchy matters: `countryOf()` takes the first row with a NULL parent, and every chain
   * starts there. Abuja/Lagos therefore hang off a country row rather than sitting parent-less.
   */
  public_location_catalog: [
    { location_id: 'mock-location-ng', parent_id: null, location_type: 'country', display_name: 'Nigeria', canonical_code: 'ng', market_id: MOCK_MARKET_ID },
    { location_id: 'mock-location-abuja', parent_id: 'mock-location-ng', location_type: 'region', display_name: 'Abuja', canonical_code: 'abuja', market_id: MOCK_MARKET_ID },
    { location_id: 'mock-location-gwarinpa', parent_id: 'mock-location-abuja', location_type: 'locality', display_name: 'Gwarinpa', canonical_code: 'gwarinpa', market_id: MOCK_MARKET_ID },
    { location_id: 'mock-location-lagos', parent_id: 'mock-location-ng', location_type: 'region', display_name: 'Lagos', canonical_code: 'lagos', market_id: MOCK_MARKET_ID },
  ],
  public_service_catalog: [
    { service_entity_id: 'mock-service-plumbing', canonical_key: 'plumbing_residential', display_name: 'Plumbing' },
    { service_entity_id: 'mock-service-electrical', canonical_key: 'electrical_systems', display_name: 'Electrical Systems' },
    { service_entity_id: 'mock-service-hvac', canonical_key: 'air_conditioning_hvac', display_name: 'Air Conditioning & HVAC' },
    { service_entity_id: 'mock-service-cleaning', canonical_key: 'home_cleaning', display_name: 'Home Cleaning' },
  ],
  /** Aliases are how `/ng/abuja/gwarinpa/plumbers` matches the Plumbing service. */
  public_service_alias_catalog: [
    { service_entity_id: 'mock-service-plumbing', language_code: 'en', phrase: 'plumbers' },
    { service_entity_id: 'mock-service-plumbing', language_code: 'en', phrase: 'plumbing' },
    { service_entity_id: 'mock-service-plumbing', language_code: 'en', phrase: 'plumbing repair' },
    { service_entity_id: 'mock-service-electrical', language_code: 'en', phrase: 'electricians' },
  ],
  /**
   * Registered handles. `location_id: null` rows are the MARKET-level routes the taxonomy reads
   * (they decide `service.slug`, which is what the directory links to); the row with a locality is
   * the live local leaf. Both kinds are needed, and they are different pages.
   */
  public_service_route_catalog: [
    { service_entity_id: 'mock-service-plumbing', slug: 'plumbing', canonical_path: '/ng/services/plumbing/', indexability: 'insufficient_supply', minimum_supply: 3, location_id: null, language_code: 'en' },
    { service_entity_id: 'mock-service-electrical', slug: 'electrical-systems', canonical_path: '/ng/services/electrical-systems/', indexability: 'insufficient_supply', minimum_supply: 3, location_id: null, language_code: 'en' },
    { service_entity_id: 'mock-service-hvac', slug: 'air-conditioning-hvac', canonical_path: '/ng/services/air-conditioning-hvac/', indexability: 'insufficient_supply', minimum_supply: 3, location_id: null, language_code: 'en' },
    { service_entity_id: 'mock-service-cleaning', slug: 'home-cleaning', canonical_path: '/ng/services/home-cleaning/', indexability: 'insufficient_supply', minimum_supply: 3, location_id: null, language_code: 'en' },
    { service_entity_id: 'mock-service-plumbing', slug: 'plumbers', canonical_path: '/ng/abuja/gwarinpa/plumbers/', indexability: 'insufficient_supply', minimum_supply: 3, location_id: 'mock-location-gwarinpa', language_code: 'en' },
  ],
  /** The curated grouping layer, so the directory has a category above the services. */
  public_service_category_catalog: [
    {
      category_id: 'mock-category-home-property',
      market_id: null,
      canonical_key: 'home_property_maintenance',
      slug: 'home-property',
      display_name: 'Home & property maintenance',
      definition:
        'The trades that keep a building running: water, power, cooling and the cleaning between them.',
      guidance: ['Describe the symptom, not the fix you have in mind.'],
      language_code: 'en',
      sort_order: 1,
    },
  ],
  public_service_category_member_catalog: [
    { category_id: 'mock-category-home-property', service_entity_id: 'mock-service-plumbing', sort_order: 1 },
    { category_id: 'mock-category-home-property', service_entity_id: 'mock-service-electrical', sort_order: 2 },
    { category_id: 'mock-category-home-property', service_entity_id: 'mock-service-hvac', sort_order: 3 },
    { category_id: 'mock-category-home-property', service_entity_id: 'mock-service-cleaning', sort_order: 4 },
  ],
  public_problem_catalog: [
    {
      problem_entity_id: 'mock-problem-leaking-pipe',
      market_id: null,
      canonical_key: 'leaking_pipe',
      slug: 'leaking-pipe',
      display_name: 'A leaking pipe or joint',
      definition:
        'Water escaping from a pipe, joint or fitting — under a sink, behind a wall, or along an outdoor run.',
      severity: 'routine',
      severity_note: 'Not urgent, but worth fixing before it damages what is underneath.',
      guidance: [
        'Shut the water off at the nearest isolation valve before describing the job.',
        'Say whether it is a drip, a spray or a steady flow.',
        'Name what is underneath: cabinetry, flooring, ceiling or nothing at all.',
      ],
      aliases: ['leaking pipe', 'pipe leak', 'dripping pipe'],
      language_code: 'en',
      sort_order: 1,
      is_active: true,
    },
  ],
  public_problem_service_catalog: [
    { problem_entity_id: 'mock-problem-leaking-pipe', service_entity_id: 'mock-service-plumbing', sort_order: 1 },
  ],
  public_outcome_catalog: [
    {
      outcome_entity_id: 'mock-outcome-lower-energy-bills',
      market_id: null,
      canonical_key: 'lower_energy_bills',
      slug: 'lower-energy-bills',
      display_name: 'Lower energy bills',
      definition:
        'Reduce what a building spends on cooling and standby power before replacing equipment that still has life in it.',
      planning_steps: [
        { title: 'Measure a normal week', body: 'Record what the building actually draws before changing anything.' },
        { title: 'Service what already runs', body: 'Cleaning, filters and re-gassing come before new units.' },
        { title: 'Zone the space', body: 'Stop conditioning rooms nobody is using.' },
      ],
      aliases: ['reduce energy costs', 'cheaper cooling'],
      language_code: 'en',
      sort_order: 1,
      is_active: true,
    },
  ],
  public_outcome_service_catalog: [
    { outcome_entity_id: 'mock-outcome-lower-energy-bills', service_entity_id: 'mock-service-hvac', sort_order: 1 },
  ],
};

/**
 * RPC answers. Everything not listed resolves `null`, which lands most features on their empty
 * state. The admin context is the exception: `null` there makes /admin and every /admin/* page
 * redirect to `/`, so preview mode returns an owner context instead — every capability is granted,
 * so the whole admin navigation renders.
 */
/**
 * The two preview projects, keyed by assignment id.
 *
 * ⚠️ THEY ARE DELIBERATELY DIFFERENT FROM EACH OTHER. One is a provider's funded job in progress with a blocked
 * task and evidence already on it; the other is a customer's accepted job with no time agreed and the payment not
 * funded. Between them they exercise the amber risk band, both flavours of next-action card, the progress bar, the
 * collapsed money disclosure and the empty states — which is the point of a preview, and the reason a single
 * polished project would have been the wrong fixture.
 *
 * THE SHAPE IS `get_project_command`'s OWN, NOT A CONVENIENT ONE. Every key below is the jsonb key that command
 * builds and that `features/projects/project.ts` reads back, including the ones nothing renders yet.
 */
const MOCK_PROJECTS: Record<string, unknown> = {
  [MOCK_ASSIGNMENT_ID]: {
    allowed: true,
    role: 'provider',
    project: {
      assignment_id: MOCK_ASSIGNMENT_ID,
      request_id: MOCK_REQUEST_ID,
      outcome: 'Replace the kitchen mixer tap and reseal the sink',
      state: 'in_progress',
      urgency: 'soon',
      assigned_at: daysAgo(2),
      completed_at: null,
      timezone: 'Africa/Lagos',
      service_name: 'Plumbing',
      location_name: 'Gwarinpa',
      city_name: 'Abuja',
      currency_code: 'NGN',
      customer_name: 'Ada O.',
      provider_name: 'Mock Provider Co',
      customer_account_id: MOCK_ACCOUNT_ID,
      provider_account_id: MOCK_ACCOUNT_ID,
    },
    schedule: {
      scheduled_start: hoursFromNow(3),
      scheduled_end: hoursFromNow(5),
      timezone: 'Africa/Lagos',
      status: 'confirmed',
      confirmed_at: daysAgo(1),
    },
    agreement: {
      quote_version: 'v1.0',
      total_minor: 4_500_000,
      currency_code: 'NGN',
      accepted_at: daysAgo(2),
      auth_method: 'password',
    },
    money: {
      obligation_status: 'funded',
      amount_minor: 4_500_000,
      currency_code: 'NGN',
      payout_status: 'pending',
      payout_amount_minor: 4_050_000,
    },
    risks: [
      {
        key: 'tasks_blocked',
        severity: 'medium',
        label: '1 task(s) blocked',
        detail: 'Individual tasks are marked blocked. The job itself is still running.',
      },
    ],
    next_action: {
      key: 'plan_next',
      title: 'Continue the plan',
      detail: '2 of 4 tasks are done.',
      href_kind: 'project_work',
    },
    progress: {
      tasks_total: 4,
      tasks_done: 2,
      tasks_blocked: 1,
      tasks_awaiting_approval: 0,
      tasks_overdue: 0,
      stages: 2,
    },
    stages: [
      {
        id: 'mock-stage-1',
        ordinal: 1,
        title: 'Make safe and isolate',
        description: 'Stop the water and protect the cabinet before anything is removed.',
        task_count: 2,
        done_count: 2,
        tasks: [
          {
            id: 'mock-task-1',
            ordinal: 1,
            title: 'Isolate the water supply',
            status: 'completed',
            blocked_reason: null,
            scheduled_start: hoursFromNow(-26),
            scheduled_end: hoursFromNow(-25),
            assignee_role: 'provider',
            criteria_total: 2,
            criteria_done: 2,
            completed_at: hoursFromNow(-25),
            updated_at: hoursFromNow(-25),
          },
          {
            id: 'mock-task-2',
            ordinal: 2,
            title: 'Empty the cabinet and lay down protection',
            status: 'completed',
            blocked_reason: null,
            scheduled_start: hoursFromNow(-24),
            scheduled_end: hoursFromNow(-23),
            assignee_role: 'provider',
            criteria_total: 1,
            criteria_done: 1,
            completed_at: hoursFromNow(-23),
            updated_at: hoursFromNow(-23),
          },
        ],
      },
      {
        id: 'mock-stage-2',
        ordinal: 2,
        title: 'Replace and reseal',
        description: 'Fit the new mixer, reseal the sink and test for leaks.',
        task_count: 2,
        done_count: 0,
        tasks: [
          {
            id: 'mock-task-3',
            ordinal: 1,
            title: 'Fit the replacement mixer tap',
            status: 'in_progress',
            blocked_reason: null,
            scheduled_start: hoursFromNow(3),
            scheduled_end: hoursFromNow(4),
            assignee_role: 'provider',
            criteria_total: 3,
            criteria_done: 1,
            completed_at: null,
            updated_at: hoursFromNow(-2),
          },
          {
            id: 'mock-task-4',
            ordinal: 2,
            title: 'Reseal the sink and run a leak test',
            status: 'blocked',
            blocked_reason: 'Waiting on a material or part',
            scheduled_start: hoursFromNow(4),
            scheduled_end: hoursFromNow(5),
            assignee_role: 'provider',
            criteria_total: 2,
            criteria_done: 0,
            completed_at: null,
            updated_at: hoursFromNow(-1),
          },
        ],
      },
    ],
    milestones: [
      { key: 'agreement', label: 'Agreement accepted', at: daysAgo(2), done: true },
      { key: 'funded', label: 'Payment funded', at: daysAgo(2), done: true },
      { key: 'started', label: 'Work started', at: hoursFromNow(-26), done: true },
      { key: 'submitted', label: 'Submitted for approval', at: null, done: false },
      { key: 'paid', label: 'Paid out', at: null, done: false },
    ],
    evidence: [
      {
        id: 'mock-evidence-1',
        kind: 'photo',
        note: 'The isolation valve under the sink, closed.',
        storage_path: 'mock/evidence-1.jpg',
        submitted_at: hoursFromNow(-26),
      },
      {
        id: 'mock-evidence-2',
        kind: 'note',
        note: 'Cabinet floor was dry when I started, so the damp is from the tap and not the trap.',
        storage_path: null,
        submitted_at: hoursFromNow(-24),
      },
    ],
    changes: [
      {
        id: 'mock-change-1',
        kind: 'change_request',
        message: 'The waste trap is cracked as well. Can it be replaced in the same visit?',
        status: 'open',
        created_at: hoursFromNow(-1),
      },
    ],
  },

  [MOCK_SECOND_ASSIGNMENT_ID]: {
    allowed: true,
    role: 'customer',
    project: {
      assignment_id: MOCK_SECOND_ASSIGNMENT_ID,
      request_id: MOCK_SECOND_REQUEST_ID,
      outcome: 'Service the split air conditioner in the main bedroom',
      state: 'accepted',
      urgency: 'normal',
      assigned_at: daysAgo(1),
      completed_at: null,
      timezone: 'Africa/Lagos',
      service_name: 'Air Conditioning',
      location_name: 'Gwarinpa',
      city_name: 'Abuja',
      currency_code: 'NGN',
      customer_name: 'Mock User',
      provider_name: 'Cold Room Services Ltd',
      customer_account_id: MOCK_ACCOUNT_ID,
      provider_account_id: 'mock-provider-2',
    },
    schedule: null,
    agreement: {
      quote_version: 'v1.0',
      total_minor: 2_800_000,
      currency_code: 'NGN',
      accepted_at: daysAgo(1),
      auth_method: 'password',
    },
    money: {
      obligation_status: 'pending',
      amount_minor: 2_800_000,
      currency_code: 'NGN',
      payout_status: null,
      payout_amount_minor: null,
    },
    risks: [
      {
        key: 'unfunded',
        severity: 'medium',
        label: 'The payment has not been funded',
        detail: 'Paid work cannot start until the customer funds the obligation.',
      },
    ],
    next_action: {
      key: 'fund_payment',
      title: 'Fund the agreed amount',
      detail: 'The provider is assigned and cannot start until the money is in place.',
      href_kind: 'customer_booking',
    },
    progress: {
      tasks_total: 3,
      tasks_done: 0,
      tasks_blocked: 0,
      tasks_awaiting_approval: 0,
      tasks_overdue: 0,
      stages: 1,
    },
    stages: [
      {
        id: 'mock-stage-3',
        ordinal: 1,
        title: 'Service the unit',
        description: 'Clean the filters, check the gas pressure and confirm the drain runs clear.',
        task_count: 3,
        done_count: 0,
        tasks: [
          {
            id: 'mock-task-5',
            ordinal: 1,
            title: 'Clean the filters and the indoor coil',
            status: 'not_started',
            blocked_reason: null,
            scheduled_start: null,
            scheduled_end: null,
            assignee_role: 'provider',
            criteria_total: 2,
            criteria_done: 0,
            completed_at: null,
            updated_at: null,
          },
          {
            id: 'mock-task-6',
            ordinal: 2,
            title: 'Check the gas pressure',
            status: 'not_started',
            blocked_reason: null,
            scheduled_start: null,
            scheduled_end: null,
            assignee_role: 'provider',
            criteria_total: 1,
            criteria_done: 0,
            completed_at: null,
            updated_at: null,
          },
          {
            id: 'mock-task-7',
            ordinal: 3,
            title: 'Confirm the drain runs clear',
            status: 'not_started',
            blocked_reason: null,
            scheduled_start: null,
            scheduled_end: null,
            assignee_role: 'provider',
            criteria_total: 1,
            criteria_done: 0,
            completed_at: null,
            updated_at: null,
          },
        ],
      },
    ],
    milestones: [
      { key: 'agreement', label: 'Agreement accepted', at: daysAgo(1), done: true },
      { key: 'funded', label: 'Payment funded', at: null, done: false },
      { key: 'started', label: 'Work started', at: null, done: false },
      { key: 'submitted', label: 'Submitted for approval', at: null, done: false },
      { key: 'paid', label: 'Paid out', at: null, done: false },
    ],
    evidence: [],
    changes: [],
  },
};

/**
 * A preview read whose answer depends on which project is being opened.
 *
 * ⚠️ ONLY THE PROJECT READS USE THIS. Everything else in this file ignores the argument on purpose (see the note
 * on `MOCK_TABLE_ROWS`), but "which project" is the one parameter a reviewer is actively switching between. The
 * first project is the fallback, so a hand-typed or stale id renders a seeded document rather than an empty page.
 */
const perProject =
  (byAssignment: Record<string, unknown>) =>
  (args?: Record<string, unknown>): unknown =>
    byAssignment[String(args?.p_assignment_id)] ?? byAssignment[MOCK_ASSIGNMENT_ID];

const MOCK_RPC_RESULTS: Record<string, unknown> = {
  /** `true` so /account/activate-admin-access renders its screen instead of redirecting to `/`. */
  platform_admin_activation_required_command: true,
  admin_context_command: {
    account_id: MOCK_ACCOUNT_ID,
    is_owner: true,
    roles: [{ key: 'platform_admin', name: 'Administrator' }],
    capabilities: [
      'platform.admin',
      'platform.support',
      'platform.trust',
      'platform.projects',
      'platform.money',
      'platform.seo',
      'platform.taxonomy',
      'platform.markets',
      'platform.operations',
    ],
  },

  /* ------------------------------------------------------------------ provider workspace
   *
   * ⚠️ EVERY PROVIDER PAGE READS THROUGH A `*_command` RPC, AND AN UNMAPPED COMMAND RESOLVES `null`.
   * That is why the whole workspace — starting with /provider — used to land on "could not be
   * loaded": the reads did not fail, they answered nothing, and the pages correctly refuse to
   * pretend an empty day means "nothing is scheduled". These are the shapes those commands return,
   * field for field. The keys must be the database's snake_case names, because the parsers in
   * features/provider-workspace/ read the raw object themselves rather than trusting a type.
   */
  get_my_provider_day_command: {
    provider: {
      id: MOCK_PROVIDER_ID,
      display_name: 'Mock Provider Co',
      status: 'draft',
      is_public: false,
      slug: null,
      accepts_new_work: true,
      payout_verified: true,
    },
    readiness: {
      total_score: 72,
      readiness: 'needs_attention',
      reasons: ['Two more verified credentials would raise this above 80.'],
      evaluated_at: daysAgo(1),
    },
    counts: { active_jobs: 2, opportunities: 2, unanswered_opportunities: 1, actions: 2 },
    schedule: [
      {
        assignment_id: MOCK_ASSIGNMENT_ID,
        request_id: MOCK_REQUEST_ID,
        need_text: 'Replace the kitchen mixer tap and reseal the sink',
        request_state: 'accepted',
        urgency: 'soon',
        location_name: 'Gwarinpa, Abuja',
        landmark: 'Blue gate beside the pharmacy',
        access_notes: 'Ask for the caretaker; the gate bell does not work.',
        assigned_at: daysAgo(2),
        scheduled_start: hoursFromNow(3),
        scheduled_end: hoursFromNow(5),
        schedule_timezone: 'Africa/Lagos',
        schedule_status: 'confirmed',
        confirmed_at: daysAgo(1),
        field_state: null,
        field_state_at: null,
        open_proposal: false,
        evidence_count: 0,
        obligation_status: 'pending',
        amount_minor: 4_500_000,
        currency_code: 'NGN',
        start_allowed: true,
      },
      {
        assignment_id: MOCK_SECOND_ASSIGNMENT_ID,
        request_id: MOCK_SECOND_REQUEST_ID,
        need_text: 'Service the split air conditioner in the main bedroom',
        request_state: 'accepted',
        urgency: 'normal',
        location_name: 'Wuse 2, Abuja',
        landmark: null,
        access_notes: null,
        assigned_at: daysAgo(4),
        scheduled_start: hoursFromNow(-2),
        scheduled_end: hoursFromNow(1),
        schedule_timezone: 'Africa/Lagos',
        schedule_status: 'confirmed',
        confirmed_at: daysAgo(3),
        field_state: 'on_site',
        field_state_at: hoursFromNow(-1),
        open_proposal: false,
        evidence_count: 2,
        obligation_status: 'pending',
        amount_minor: 3_200_000,
        currency_code: 'NGN',
        start_allowed: false,
      },
    ],
    opportunities: [
      {
        request_id: MOCK_THIRD_REQUEST_ID,
        need_text: 'Trace a tripping circuit in a two-bedroom flat',
        request_state: 'matching',
        service_name: 'Electrical Systems',
        location_name: 'Gwarinpa, Abuja',
        created_at: hoursFromNow(-6),
        quote_id: null,
        quote_status: null,
      },
    ],
    actions: [
      {
        kind: 'completion_evidence',
        assignment_id: MOCK_SECOND_ASSIGNMENT_ID,
        request_id: MOCK_SECOND_REQUEST_ID,
        credential_id: null,
        detail: null,
        due_at: hoursFromNow(24),
      },
      {
        kind: 'credential_expiring',
        assignment_id: null,
        request_id: null,
        credential_id: 'mock-credential-1',
        detail: null,
        due_at: dateIn(21),
      },
    ],
    earnings: [{ currency_code: 'NGN', cleared_minor: 12_500_000, pending_minor: 3_200_000, blocked_minor: 0 }],
    awaiting_funding: [{ currency_code: 'NGN', amount_minor: 4_500_000 }],
  },

  get_my_work_command: [
    {
      assignment_id: MOCK_ASSIGNMENT_ID,
      request_id: MOCK_REQUEST_ID,
      need_text: 'Replace the kitchen mixer tap and reseal the sink',
      request_state: 'accepted',
      urgency: 'soon',
      assignment_status: 'active',
      assigned_at: daysAgo(2),
      ended_at: null,
      scheduled_start: hoursFromNow(3),
      scheduled_end: hoursFromNow(5),
      schedule_timezone: 'Africa/Lagos',
      schedule_status: 'confirmed',
      confirmed_at: daysAgo(1),
      field_state: null,
      field_state_at: null,
      obligation_status: 'pending',
      amount_minor: 4_500_000,
      currency_code: 'NGN',
      evidence_count: 0,
      steps_total: 4,
      steps_done: 0,
      open_blocker_reason: null,
      correction_open: false,
      approved_at: null,
      location_name: 'Gwarinpa',
      city_name: 'Abuja',
      service_name: 'Plumbing',
      customer_display_name: 'Ada O.',
    },
    {
      assignment_id: MOCK_SECOND_ASSIGNMENT_ID,
      request_id: MOCK_SECOND_REQUEST_ID,
      need_text: 'Service the split air conditioner in the main bedroom',
      request_state: 'accepted',
      urgency: 'normal',
      assignment_status: 'active',
      assigned_at: daysAgo(4),
      ended_at: null,
      scheduled_start: hoursFromNow(-2),
      scheduled_end: hoursFromNow(1),
      schedule_timezone: 'Africa/Lagos',
      schedule_status: 'confirmed',
      confirmed_at: daysAgo(3),
      field_state: 'on_site',
      field_state_at: hoursFromNow(-1),
      obligation_status: 'pending',
      amount_minor: 3_200_000,
      currency_code: 'NGN',
      evidence_count: 2,
      steps_total: 3,
      steps_done: 1,
      open_blocker_reason: null,
      correction_open: false,
      approved_at: null,
      location_name: 'Wuse 2',
      city_name: 'Abuja',
      service_name: 'Air Conditioning & HVAC',
      customer_display_name: 'Tunde A.',
    },
    {
      assignment_id: 'mock-assignment-3',
      request_id: 'mock-request-4',
      need_text: 'Rewire the distribution board in a shop unit',
      request_state: 'completed',
      urgency: 'normal',
      assignment_status: 'completed',
      assigned_at: daysAgo(40),
      ended_at: daysAgo(30),
      scheduled_start: daysAgo(31),
      scheduled_end: daysAgo(31),
      schedule_timezone: 'Africa/Lagos',
      schedule_status: 'confirmed',
      confirmed_at: daysAgo(33),
      field_state: 'work_started',
      field_state_at: daysAgo(31),
      obligation_status: 'released',
      amount_minor: 9_800_000,
      currency_code: 'NGN',
      evidence_count: 5,
      steps_total: 3,
      steps_done: 3,
      open_blocker_reason: null,
      correction_open: false,
      approved_at: daysAgo(29),
      location_name: 'Wuse 2',
      city_name: 'Abuja',
      service_name: 'Electrical Systems',
      customer_display_name: 'Bello Traders',
    },
  ],

  get_my_opportunities_command: [
    {
      request_id: MOCK_THIRD_REQUEST_ID,
      need_text: 'Trace a tripping circuit in a two-bedroom flat',
      request_state: 'matching',
      urgency: 'soon',
      service_entity_id: 'mock-service-electrical',
      service_name: 'Electrical Systems',
      location_id: 'mock-location-gwarinpa',
      location_name: 'Gwarinpa',
      city_name: 'Abuja',
      region_name: 'Abuja',
      band: 'primary',
      is_primary_area: true,
      fit_score: 86,
      fit_reasons: ['Your main service area', 'Matches Electrical Systems'],
      posted_at: hoursFromNow(-6),
      preferred_window: 'This week, mornings',
      hazardous: false,
      response: null,
      response_reason: null,
      quote_id: null,
      quote_status: null,
      quote_version: null,
      has_draft: false,
      unread_from_customer: false,
    },
    {
      request_id: 'mock-request-5',
      need_text: 'Install two ceiling fans and a new light fitting',
      request_state: 'matching',
      urgency: 'normal',
      service_entity_id: 'mock-service-electrical',
      service_name: 'Electrical Systems',
      location_id: 'mock-location-lagos',
      location_name: 'Lekki',
      city_name: 'Lagos',
      region_name: 'Lagos',
      band: 'covered',
      is_primary_area: false,
      fit_score: 64,
      fit_reasons: ['An area you cover', 'Matches Electrical Systems'],
      posted_at: daysAgo(1),
      preferred_window: 'Flexible',
      hazardous: false,
      response: 'interested',
      response_reason: null,
      quote_id: null,
      quote_status: null,
      quote_version: null,
      has_draft: false,
      unread_from_customer: false,
    },
  ],

  /** Readiness asks this one only for a count of opportunities already answered. */
  list_my_provider_opportunities_command: [
    { provider_id: MOCK_PROVIDER_ID, quote_id: null, quote_status: null },
    { provider_id: MOCK_PROVIDER_ID, quote_id: MOCK_QUOTE_ID, quote_status: 'submitted' },
  ],

  get_my_earnings_command: {
    provider: { id: MOCK_PROVIDER_ID, display_name: 'Mock Provider Co', payout_verified: true },
    currencies: [
      {
        currency_code: 'NGN',
        ledger_balance_minor: 12_500_000,
        gross_funded_minor: 22_300_000,
        in_escrow_minor: 4_500_000,
        eligible_minor: 3_200_000,
        in_flight_minor: 0,
        blocked_minor: 0,
        paid_out_minor: 9_300_000,
        reduced_minor: 0,
        platform_fee_minor: 1_115_000,
        reconciliation_delta_minor: 0,
      },
    ],
    items: [
      {
        obligation_id: 'mock-obligation-1',
        request_id: MOCK_REQUEST_ID,
        need_text: 'Replace the kitchen mixer tap and reseal the sink',
        request_state: 'accepted',
        completed_at: null,
        obligation_created_at: daysAgo(2),
        gross_minor: 4_500_000,
        currency_code: 'NGN',
        obligation_status: 'pending',
        refunded_minor: 0,
        net_payable_minor: 4_275_000,
        payout_id: null,
        payout_status: null,
        payout_amount_minor: null,
        payout_paid_at: null,
        payout_reference: null,
      },
      {
        obligation_id: 'mock-obligation-2',
        request_id: 'mock-request-4',
        need_text: 'Rewire the distribution board in a shop unit',
        request_state: 'completed',
        completed_at: daysAgo(30),
        obligation_created_at: daysAgo(31),
        gross_minor: 9_800_000,
        currency_code: 'NGN',
        obligation_status: 'released',
        refunded_minor: 0,
        net_payable_minor: 9_310_000,
        payout_id: 'mock-payout-1',
        payout_status: 'paid',
        payout_amount_minor: 9_310_000,
        payout_paid_at: daysAgo(22),
        payout_reference: 'MOCK-PAYOUT-0001',
      },
    ],
  },

  get_my_assignment_command: {
    assignment: {
      id: MOCK_ASSIGNMENT_ID,
      status: 'active',
      assigned_at: daysAgo(2),
      ended_at: null,
      field_state: null,
      field_state_at: null,
    },
    request: {
      id: MOCK_REQUEST_ID,
      need_text: 'Replace the kitchen mixer tap and reseal the sink',
      state: 'accepted',
      urgency: 'soon',
      timezone: 'Africa/Lagos',
      service_name: 'Plumbing',
      location_name: 'Gwarinpa',
      city_name: 'Abuja',
      currency_code: 'NGN',
    },
    customer: { display_name: 'Ada O.', has_photo: false },
    schedule: {
      scheduled_start: hoursFromNow(3),
      scheduled_end: hoursFromNow(5),
      timezone: 'Africa/Lagos',
      note: 'Access through the side gate.',
      status: 'confirmed',
      confirmed_at: daysAgo(1),
    },
    obligation: { status: 'pending', amount_minor: 4_500_000, currency_code: 'NGN' },
    site: {
      landmark: 'Blue gate beside the pharmacy',
      access_notes: 'Ask for the caretaker; the gate bell does not work.',
      area_text: 'Gwarinpa, Abuja',
      hazardous: false,
    },
    steps: [
      { id: 'mock-step-1', ordinal: 1, label: 'Isolate the water supply', state: 'todo', note: null },
      { id: 'mock-step-2', ordinal: 2, label: 'Remove the old mixer tap', state: 'todo', note: null },
      { id: 'mock-step-3', ordinal: 3, label: 'Fit the replacement and reseal', state: 'todo', note: null },
      { id: 'mock-step-4', ordinal: 4, label: 'Restore the supply and test', state: 'todo', note: null },
    ],
    evidence: [],
    blocker: null,
    correction: null,
    approved_at: null,
    agreement: {
      quote_version: 'v1.0',
      total_minor: 4_500_000,
      currency_code: 'NGN',
      accepted_at: daysAgo(2),
      auth_method: 'typed_name',
    },
  },

  get_my_opportunity_detail_command: {
    request: {
      id: MOCK_THIRD_REQUEST_ID,
      need_text: 'Trace a tripping circuit in a two-bedroom flat',
      state: 'matching',
      urgency: 'soon',
      currency_code: 'NGN',
      posted_at: hoursFromNow(-6),
      service_name: 'Electrical Systems',
      location_name: 'Gwarinpa',
      city_name: 'Abuja',
      region_name: 'Abuja',
      band: 'primary',
      is_primary_area: true,
      preferred_window: 'This week, mornings',
      hazardous: false,
    },
    fit: {
      score: 86,
      reasons: [
        'The location is your main service area.',
        'The service matches what you offer.',
        'You are accepting new work.',
      ],
    },
    scope: {
      answers: {
        'Which circuit trips?': 'The one that feeds the kitchen sockets.',
        'When did it start?': 'About a week ago, and it is getting more frequent.',
        'Has anything changed recently?': 'A new freezer was plugged in last month.',
      },
      not_sure: ['Whether a new breaker is needed'],
      preferred_window: 'This week, mornings',
      preferred_date: null,
      area_text: 'Gwarinpa, Abuja',
      hazardous: false,
    },
    response: { response: null, reason_code: null },
    quotes: [],
    draft: null,
    message_count: 0,
  },

  get_my_request_header_command: {
    id: MOCK_THIRD_REQUEST_ID,
    need_text: 'Trace a tripping circuit in a two-bedroom flat',
    state: 'matching',
    urgency: 'soon',
    posted_at: hoursFromNow(-6),
    timezone: 'Africa/Lagos',
    service_name: 'Electrical Systems',
    location_name: 'Gwarinpa',
    city_name: 'Abuja',
    currency_code: 'NGN',
    quote_count: 0,
    assignment_id: null,
  },

  // ── The project workspace, /app/projects/{assignmentId} ─────────────────────────────────────────
  //
  // ⚠️ THESE WERE MISSING AND THE ROUTE 404'd BECAUSE OF IT. `get_project_command` is the read that answers
  // "may this caller see this project", and the page turns anything but `allowed: true` into `notFound()`. The
  // mock answers `null` for a function it has no fixture for, so every project card led to a 404 while the app
  // behaved exactly as written. The gap was here, not in the page.
  //
  // ⚠️ THE ARGUMENT IS HONOURED FOR THESE, UNLIKE EVERYWHERE ELSE. `MOCK_TABLE_ROWS` deliberately ignores
  // filters, but two cards that open the same document would read as a bug in the index, so each read looks the
  // assignment up and falls back to the first project — a stale id still renders instead of 404ing.
  get_project_command: perProject(MOCK_PROJECTS),

  get_project_messages_command: perProject({
    [MOCK_ASSIGNMENT_ID]: {
      allowed: true,
      role: 'provider',
      contexts: [
        { kind: 'project', label: 'The project', tasks: [] },
        {
          kind: 'task',
          label: 'Task',
          tasks: [{ id: 'mock-task-4', title: 'Reseal the sink and run a leak test' }],
        },
      ],
      messages: [
        {
          id: 'mock-message-1',
          context_kind: 'task',
          context_id: 'mock-task-4',
          context_label: 'Reseal the sink and run a leak test',
          author_role: 'provider',
          author_name: 'Mock Provider Co',
          body: 'The waste trap is cracked, so the seal will not hold without a new one. I can fit it today if you agree to add it.',
          translated_body: null,
          translated_language: null,
          attachment: null,
          created_at: hoursFromNow(-2),
        },
        {
          id: 'mock-message-2',
          context_kind: 'project',
          context_id: null,
          context_label: 'The project',
          author_role: 'customer',
          author_name: 'Ada O.',
          body: 'Go ahead if it is under ₦8,000. Anything more than that, send me a photo first.',
          translated_body: null,
          translated_language: null,
          attachment: {
            evidence_id: 'mock-evidence-2',
            kind: 'note',
            note: 'The cracked trap, photographed before removal',
          },
          created_at: hoursFromNow(-1),
        },
      ],
      activity: [
        {
          kind: 'task_status_changed',
          label: 'Task "Fit the replacement mixer tap" moved to in progress',
          at: hoursFromNow(-2),
        },
        { kind: 'evidence_added', label: 'A photo was added as evidence', at: hoursFromNow(-26) },
      ],
    },
    [MOCK_SECOND_ASSIGNMENT_ID]: {
      allowed: true,
      role: 'customer',
      contexts: [{ kind: 'project', label: 'The project', tasks: [] }],
      messages: [
        {
          id: 'mock-message-3',
          context_kind: 'project',
          context_id: null,
          context_label: 'The project',
          author_role: 'customer',
          author_name: 'Mock User',
          body: 'The unit is in the main bedroom. The gate is usually open after 9am.',
          translated_body: null,
          translated_language: null,
          attachment: null,
          created_at: hoursFromNow(-20),
        },
      ],
      activity: [{ kind: 'assignment_created', label: 'The quote was accepted and the work was agreed', at: daysAgo(1) }],
    },
  }),

  get_project_evidence_command: perProject({
    [MOCK_ASSIGNMENT_ID]: {
      allowed: true,
      role: 'provider',
      request_state: 'in_progress',
      items: [
        {
          id: 'mock-evidence-1',
          kind: 'photo',
          note: 'The isolation valve under the sink, closed.',
          storage_path: 'mock/evidence-1.jpg',
          external_url: null,
          source: 'provider',
          submitted_at: hoursFromNow(-26),
          step_label: 'Isolate the water supply',
          uploader_role: 'provider',
          uploader_name: 'Mock Provider Co',
          open_flag_count: 0,
          flags: [],
          verification: 'submitted',
        },
        {
          id: 'mock-evidence-2',
          kind: 'note',
          note: 'The cabinet floor was dry when I started, so the damp is from the tap and not the trap.',
          storage_path: null,
          external_url: null,
          source: 'provider',
          submitted_at: hoursFromNow(-24),
          step_label: 'Empty the cabinet and lay down protection',
          uploader_role: 'provider',
          uploader_name: 'Mock Provider Co',
          open_flag_count: 1,
          flags: [
            {
              id: 'mock-flag-1',
              reason_code: 'incomplete',
              note: 'I cannot see the trap in this photo.',
              status: 'open',
              raised_by_role: 'customer',
              raised_by_me: false,
              created_at: hoursFromNow(-20),
            },
          ],
          verification: 'flagged',
        },
      ],
    },
    [MOCK_SECOND_ASSIGNMENT_ID]: {
      allowed: true,
      role: 'customer',
      request_state: 'accepted',
      // Nothing has been submitted yet, which is the point: the empty state is what the customer sees here.
      items: [],
    },
  }),

  get_project_timeline_command: perProject({
    [MOCK_ASSIGNMENT_ID]: {
      allowed: true,
      role: 'provider',
      events: [
        {
          kind: 'assignment_created',
          at: daysAgo(2),
          actor_role: 'customer',
          actor_type: 'account',
          description: 'Accepted the quote and agreed the work',
          resource_type: 'assignment',
          resource_id: MOCK_ASSIGNMENT_ID,
          reason_code: null,
          is_override: false,
        },
        {
          kind: 'obligation_funded',
          at: daysAgo(2),
          actor_role: 'customer',
          actor_type: 'account',
          description: 'Funded ₦45,000',
          resource_type: 'payment_obligation',
          resource_id: 'mock-obligation-1',
          reason_code: null,
          is_override: false,
        },
        {
          kind: 'task_completed',
          at: hoursFromNow(-25),
          actor_role: 'provider',
          actor_type: 'account',
          description: 'Completed "Isolate the water supply"',
          resource_type: 'task',
          resource_id: 'mock-task-1',
          reason_code: null,
          is_override: false,
        },
        {
          kind: 'blocker_raised',
          at: hoursFromNow(-1),
          actor_role: 'provider',
          actor_type: 'account',
          description: 'Paused the job: waiting on a material or part',
          resource_type: 'assignment',
          resource_id: MOCK_ASSIGNMENT_ID,
          reason_code: 'missing_material',
          is_override: false,
        },
      ],
    },
    [MOCK_SECOND_ASSIGNMENT_ID]: {
      allowed: true,
      role: 'customer',
      events: [
        {
          kind: 'assignment_created',
          at: daysAgo(1),
          actor_role: 'customer',
          actor_type: 'account',
          description: 'Accepted the quote and agreed the work',
          resource_type: 'assignment',
          resource_id: MOCK_SECOND_ASSIGNMENT_ID,
          reason_code: null,
          is_override: false,
        },
      ],
    },
  }),

  get_project_documents_command: perProject({
    [MOCK_ASSIGNMENT_ID]: {
      allowed: true,
      role: 'provider',
      agreement_acceptance: { version: 'v1.0', accepted_at: daysAgo(2), auth_method: 'password' },
      documents: [
        {
          document_group_id: 'mock-doc-group-1',
          title: 'Signed agreement',
          document_type: 'agreement',
          latest_version: 1,
          latest_created_at: daysAgo(2),
          access_scope: 'participants',
          versions: [
            {
              id: 'mock-doc-1',
              version_major: 1,
              title: 'Signed agreement',
              document_type: 'agreement',
              mime_type: 'application/pdf',
              size_bytes: 184_320,
              access_scope: 'participants',
              created_at: daysAgo(2),
              uploader_role: 'customer',
              uploader_name: 'Ada O.',
              uploaded_by_me: false,
              signer_status: 'signed',
              decisions: [
                { decision: 'approved', role: 'provider', note: 'Agreed as written.', decided_at: daysAgo(2) },
              ],
            },
          ],
        },
      ],
    },
    [MOCK_SECOND_ASSIGNMENT_ID]: {
      allowed: true,
      role: 'customer',
      agreement_acceptance: { version: 'v1.0', accepted_at: daysAgo(1), auth_method: 'password' },
      documents: [],
    },
  }),

  get_project_milestones_command: perProject({
    [MOCK_ASSIGNMENT_ID]: {
      allowed: true,
      role: 'provider',
      state: 'in_progress',
      checkpoint: {
        amount_minor: 4_500_000,
        currency_code: 'NGN',
        obligation_status: 'funded',
        payout_status: 'pending',
        payout_verified_destination: true,
        required_approver: 'customer',
        tasks_total: 4,
        tasks_done: 2,
        evidence_count: 2,
        approved_at: null,
        correction_open: false,
      },
      stages: [
        { id: 'mock-stage-1', ordinal: 1, title: 'Make safe and isolate', task_count: 2, done_count: 2 },
        { id: 'mock-stage-2', ordinal: 2, title: 'Replace and reseal', task_count: 2, done_count: 0 },
      ],
      issues: [],
    },
    [MOCK_SECOND_ASSIGNMENT_ID]: {
      allowed: true,
      role: 'customer',
      state: 'accepted',
      checkpoint: {
        amount_minor: 2_800_000,
        currency_code: 'NGN',
        obligation_status: 'pending',
        payout_status: null,
        payout_verified_destination: false,
        required_approver: 'customer',
        tasks_total: 3,
        tasks_done: 0,
        evidence_count: 0,
        approved_at: null,
        correction_open: false,
      },
      stages: [{ id: 'mock-stage-3', ordinal: 1, title: 'Service the unit', task_count: 3, done_count: 0 }],
      issues: [],
    },
  }),

  /**
   * The goods hub. An empty catalogue rather than no fixture at all: without one the page would open on its
   * "unavailable" notice, which reads as a broken preview rather than a project with nothing ordered yet.
   */
  get_project_orders_command: {
    allowed: true,
    role: 'provider',
    canPlace: false,
    projectLabel: 'Replace the kitchen mixer tap and reseal the sink',
    catalog: [],
    orders: [],
    goodsHeld: [],
    paymentNote:
      'Goods are held on the commerce ledger and the job’s payment obligation on the service ledger. Neither can settle the other.',
  },

  /**
   * The customer's side of the same two jobs.
   *
   * ⚠️ THIS IS WHAT PUTS BOTH CARD SHAPES ON THE PROJECTS INDEX. `/app/projects` composes the customer's bookings
   * with the provider's work list, and only the provider half had a fixture — so every card read "you are
   * delivering this" and the customer's view of a project was unreachable from the index. The second assignment
   * is deliberately in both reads: `getMyProjects` resolves that collision the way the real command does.
   */
  get_customer_bookings: [
    {
      assignment_id: MOCK_SECOND_ASSIGNMENT_ID,
      request_id: MOCK_SECOND_REQUEST_ID,
      request_label: 'Service the split air conditioner in the main bedroom',
      request_state: 'accepted',
      assignment_status: 'active',
      provider_id: 'mock-provider-2',
      provider_name: 'Cold Room Services Ltd',
      provider_slug: null,
      location_name: 'Gwarinpa',
      landmark: 'Second gate on the left',
      access_notes: 'Call when you reach the estate gate.',
      scheduled_start: null,
      scheduled_end: null,
      schedule_timezone: 'Africa/Lagos',
      schedule_note: null,
      schedule_status: 'unscheduled',
      confirmed_at: null,
      rescheduled_at: null,
      proposal_id: null,
      proposal_start: null,
      proposal_end: null,
      proposal_timezone: null,
      proposal_message: null,
      proposal_created_at: null,
      obligation_id: 'mock-obligation-2',
      obligation_status: 'pending',
      amount_minor: 2_800_000,
      currency_code: 'NGN',
    },
  ],
};

/**
 * A chainable thenable: `.select('x').eq('a', 1).order('b').limit(5)` resolves `list`, while
 * `.single()` / `.maybeSingle()` resolves `single`. Any unknown method returns the same builder, so
 * a query the mock has never seen still resolves instead of throwing.
 */
function createThenable(result: unknown, single?: unknown) {
  const singleResult = single ?? result;

  const builder: Record<string | symbol, unknown> = new Proxy({} as Record<string | symbol, unknown>, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject);
      }
      if (prop === 'catch') {
        return (reject: (reason: unknown) => unknown) => Promise.resolve(result).catch(reject);
      }
      if (prop === 'finally') {
        return (run: () => void) => Promise.resolve(result).finally(run);
      }
      if (prop === 'single' || prop === 'maybeSingle') {
        return () => Promise.resolve(singleResult);
      }
      if (prop === 'csv' || prop === 'explain') {
        return () => Promise.resolve({ data: '', error: null });
      }
      if (prop === Symbol.toStringTag) return 'MockSupabaseThenable';
      if (prop === 'inspect' || prop === 'nodejsUtilInspect') return undefined;
      return () => builder;
    },
  });

  return builder;
}

function createQueryBuilder(table: string) {
  const rows = MOCK_TABLE_ROWS[table] ?? [];
  const list = { data: rows, error: null, count: rows.length, ...OK };
  const one = { data: rows[0] ?? null, error: null, count: rows.length ? 1 : 0, ...OK };
  return createThenable(list, one);
}

function createStorageBucket() {
  const object = { path: 'mock/object', fullPath: 'mock/object', id: 'mock', key: 'mock/object' };
  return {
    upload: async () => ({ data: object, error: null }),
    update: async () => ({ data: object, error: null }),
    move: async () => ({ data: { path: object.path }, error: null }),
    copy: async () => ({ data: { path: object.path }, error: null }),
    remove: async () => ({ data: [], error: null }),
    list: async () => ({ data: [], error: null }),
    download: async () => ({ data: null, error: null }),
    getPublicUrl: () => ({ data: { publicUrl: 'about:blank#mock' } }),
    createSignedUrl: async () => ({ data: { signedUrl: 'about:blank#mock' }, error: null }),
    createSignedUrls: async () => ({ data: [], error: null }),
  };
}

/** The mock client. Cast once here so every call site keeps the real Supabase types. */
export function createMockSupabaseClient(): SupabaseClient {
  const client = {
    auth: {
      getUser: async () => ({ data: { user: MOCK_USER }, error: null }),
      getSession: async () => ({ data: { session: MOCK_SESSION }, error: null }),
      getClaims: async () => ({
        data: { claims: { sub: MOCK_USER_ID, email: MOCK_USER.email, role: 'authenticated' }, header: {}, signature: '' },
        error: null,
      }),
      signInWithPassword: async () => ({ data: { user: MOCK_USER, session: MOCK_SESSION, weakPassword: null }, error: null }),
      signInWithOtp: async () => ({ data: { user: MOCK_USER, session: MOCK_SESSION }, error: null }),
      signUp: async () => ({ data: { user: MOCK_USER, session: MOCK_SESSION }, error: null }),
      signInWithOAuth: async () => ({ data: { provider: 'google', url: MOCK_DASHBOARD_PATH }, error: null }),
      exchangeCodeForSession: async () => ({ data: { user: MOCK_USER, session: MOCK_SESSION }, error: null }),
      verifyOtp: async () => ({ data: { user: MOCK_USER, session: MOCK_SESSION }, error: null }),
      resend: async () => ({ data: {}, error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      updateUser: async () => ({ data: { user: MOCK_USER }, error: null }),
      setSession: async () => ({ data: { user: MOCK_USER, session: MOCK_SESSION }, error: null }),
      refreshSession: async () => ({ data: { user: MOCK_USER, session: MOCK_SESSION }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        // Fires after the caller has subscribed, so a setState inside the listener is not a
        // render-phase update.
        if (typeof setTimeout === 'function') setTimeout(() => callback('SIGNED_IN', MOCK_SESSION), 0);
        return {
          data: { subscription: { id: 'mock-subscription', callback, unsubscribe: () => {} } },
        };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
          error: null,
        }),
        listFactors: async () => ({ data: { all: [], totp: [], phone: [] }, error: null }),
        enroll: async () => ({
          data: { id: 'mock-factor', type: 'totp', friendly_name: 'Mock', totp: { qr_code: '', secret: '', uri: '' } },
          error: null,
        }),
        challenge: async () => ({ data: { id: 'mock-challenge', expires_at: 0 }, error: null }),
        verify: async () => ({ data: { ...MOCK_SESSION }, error: null }),
        challengeAndVerify: async () => ({ data: { ...MOCK_SESSION }, error: null }),
        unenroll: async () => ({ data: { id: 'mock-factor' }, error: null }),
      },
    },
    from: (table: string) => createQueryBuilder(table),
    /**
     * ⚠️ THE ARGUMENT IS FORWARDED, which the original one-parameter form could not do. Most entries are plain
     * values and ignore it; the project reads are functions that key off `p_assignment_id` — see `perProject`.
     */
    rpc: (fn: string, args?: Record<string, unknown>) => {
      const entry = MOCK_RPC_RESULTS[fn];
      return createThenable({ data: typeof entry === 'function' ? entry(args) : (entry ?? null), error: null });
    },
    storage: { from: () => createStorageBucket() },
    channel: () => {
      const channel = {
        on: () => channel,
        subscribe: () => channel,
        unsubscribe: async () => 'ok',
        send: async () => 'ok',
        track: async () => 'ok',
        untrack: async () => 'ok',
      };
      return channel;
    },
    removeChannel: async () => 'ok',
    removeAllChannels: async () => [],
    getChannels: () => [],
  };

  return client as unknown as SupabaseClient;
}

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
export const MOCK_DASHBOARD_PATH = '/customer';

export const MOCK_USER_ID = 'mock-user-123';
export const MOCK_ACCOUNT_ID = 'mock-account-123';
export const MOCK_PROVIDER_ID = 'mock-provider-123';
export const MOCK_MARKET_ID = 'mock-market-ng';

const EPOCH = new Date(0).toISOString();

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
   */
  providers: [
    {
      id: MOCK_PROVIDER_ID,
      owner_account_id: MOCK_ACCOUNT_ID,
      display_name: 'Mock Provider Co',
      status: 'active',
      created_at: EPOCH,
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
    rpc: (fn: string) => createThenable({ data: MOCK_RPC_RESULTS[fn] ?? null, error: null }),
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

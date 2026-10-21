/**
 * UI Preview Mode — the environment gate for the local mock layer.
 *
 * ⚠️ TWO CONDITIONS, AND BOTH MATTER. `NODE_ENV === 'development'` is what keeps this out of a
 * production build: `next build` and `next start` both run with NODE_ENV=production, so this is
 * false there even if `NEXT_PUBLIC_ENABLE_UI_PREVIEW=true` leaks into a deployment's environment.
 * The second condition is the explicit opt-in a developer sets in `.env.local`.
 *
 * `NEXT_PUBLIC_` is required because the flag is also read by the browser Supabase client; Next
 * inlines it at build time.
 *
 * Consumers: lib/supabase/mock.ts (gates the whole mock client) and lib/supabase/middleware.ts
 * (short-circuits session refresh). Set NEXT_PUBLIC_ENABLE_UI_PREVIEW to anything other than
 * `true`, or remove it, and the app runs against live Supabase again.
 */
export const isUiPreview =
  process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_ENABLE_UI_PREVIEW === 'true';

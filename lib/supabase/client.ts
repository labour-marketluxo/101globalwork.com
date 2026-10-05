'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { IS_MOCK_MODE, createMockSupabaseClient } from '@/lib/supabase/mock';

export function createSupabaseBrowserClient(): SupabaseClient {
  // MOCK MODE: no network, no env. See lib/supabase/mock.ts for the single switch.
  if (IS_MOCK_MODE) return createMockSupabaseClient();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase browser environment is not configured');
  return createBrowserClient(url, key);
}

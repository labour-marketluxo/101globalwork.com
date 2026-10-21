import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { IS_MOCK_MODE, createMockSupabaseClient } from '@/lib/supabase/mock';

export function createSupabaseServiceClient(): SupabaseClient {
  // MOCK MODE: no network, no env, no service-role key. See lib/supabase/mock.ts.
  if (IS_MOCK_MODE) return createMockSupabaseClient();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service environment variables are not configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

import { type NextRequest } from 'next/server';
import { updateSupabaseSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  // Canonical host redirects are owned by the hosting/domain layer.
  // Keeping host canonicalization out of application middleware avoids
  // redirect loops when the platform already redirects apex <-> www.
  return updateSupabaseSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};

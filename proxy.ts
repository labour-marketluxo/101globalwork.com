import { NextResponse, type NextRequest } from 'next/server';
import { updateSupabaseSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  // One canonical production host is essential for both SEO and host-scoped auth
  // cookies. Mixed www/apex navigation can otherwise look like a sign-in loop.
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim().toLowerCase();
  const host = forwardedHost ?? request.headers.get('host')?.split(':')[0]?.toLowerCase();
  if (host === 'www.101globalwork.com') {
    const url = request.nextUrl.clone();
    url.hostname = '101globalwork.com';
    url.port = '';
    url.protocol = 'https:';
    return NextResponse.redirect(url, 308);
  }

  return updateSupabaseSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};

import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The avatar, served from the owner's own session.
 *
 * ⚠️ WHY A ROUTE RATHER THAN A PUBLIC URL. The bucket is private: an avatar is reachable only by the account
 * that owns it, and there is no way to guess a path that would work. Serving it here means the request carries
 * the visitor's cookies, the storage policy is what authorises the read, and the object never becomes
 * world-readable just because a profile page wanted to show a picture.
 *
 * ⚠️ `private, max-age=0, must-revalidate`, NOT A LONG CACHE. The same path is overwritten every time somebody
 * changes their photo, and a shared cache holding the old picture would show a face that is no longer current.
 * The profile page adds a version query string so its own <img> still avoids a redundant round trip.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Not signed in', { status: 401 });

  const [{ data: account }, { data: profile }] = await Promise.all([
    supabase.from('accounts').select('id').maybeSingle(),
    supabase.from('profiles').select('avatar_object_path, avatar_content_type').maybeSingle(),
  ]);

  // No row, or a row with no picture: not an error, just nothing to serve. The page shows initials instead.
  if (!account?.id || !profile?.avatar_object_path) return new Response('Not found', { status: 404 });

  const { data, error } = await supabase.storage.from('account-avatars').download(profile.avatar_object_path);
  if (error || !data) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[settings] could not read the avatar: ${error?.message ?? 'no data'}`);
    }
    return new Response('Not found', { status: 404 });
  }

  return new Response(await data.arrayBuffer(), {
    headers: {
      'Content-Type': profile.avatar_content_type ?? data.type ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=0, must-revalidate',
      'Content-Disposition': 'inline',
    },
  });
}

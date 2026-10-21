import { redirect } from 'next/navigation';
import { SECURITY_PATH } from '@/features/settings/paths';

/**
 * /account/update-password now redirects to the security hub.
 *
 * ⚠️ THIS IS A CONSOLIDATION, NOT A RENAME. The password form used to live here and nowhere else, and it was
 * the one way to change a password — with no step-up check at all, because the authentication provider's own
 * password update has none. The security hub's form posts to an action that refuses an aal1 session on an
 * account that has a factor, and two password forms would be two different policies for the same operation,
 * with the weaker one reachable from the browser history of anybody who used it before.
 *
 * The path stays alive rather than 404ing: it is in bookmarks, it was linked from the old settings tab bar, and
 * `?error=` parameters reference it in older email copy. A redirect costs nothing and a broken link at a
 * security page is the wrong place to save four lines.
 */
export default function UpdatePasswordPage() {
  redirect(SECURITY_PATH);
}

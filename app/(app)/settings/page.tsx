import { redirect } from 'next/navigation';
import { SESSIONS_PATH } from '@/features/settings/paths';

/**
 * /settings has no index of its own.
 *
 * The tab bar is the index, and it is drawn by the layout, so a page here would be a second list of
 * the same links. A visitor who types /settings — or follows a link from somewhere that assumed a
 * landing page — is sent to the one settings surface that exists, rather than to a 404 or to a menu
 * they would have to read before doing anything.
 *
 * `redirect` rather than `permanentRedirect`: this is a convenience, not a published URL, and if a
 * real settings overview is built later it should be able to take this path over without a 308
 * already in the browser caches of everyone who visited once.
 */
export default function SettingsIndexPage() {
  redirect(SESSIONS_PATH);
}

import { redirect } from 'next/navigation';
import { PROFILE_PATH } from '@/features/settings/paths';

/**
 * /settings has no index of its own.
 *
 * The tab bar is the index, and it is drawn by the layout, so a page here would be a second list of the same
 * links. A visitor who types /settings — or follows a link from somewhere that assumed a landing page — is sent
 * to the first tab, which is the profile: the surface that answers "who am I signed in as" and carries the
 * workspace switcher, so it is the one page that makes sense as an entry point to the other two.
 *
 * `redirect` rather than `permanentRedirect`: this is a convenience, not a published URL, and if a real
 * settings overview is built later it should be able to take this path over without a 308 already in the
 * browser caches of everyone who visited once.
 */
export default function SettingsIndexPage() {
  redirect(PROFILE_PATH);
}

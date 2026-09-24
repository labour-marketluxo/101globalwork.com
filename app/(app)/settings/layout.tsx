import SettingsTabs from '@/components/settings/SettingsTabs';
import AccountSettingsHeader from '@/components/settings/AccountSettingsHeader';
import { PAGE_SHELL } from '@/components/discovery/tokens';
import { getAccountShell } from '@/features/settings/shell';

/**
 * The account settings shell: identity, unread badges, and the tab bar.
 *
 * ⚠️ IT RENDERS NO HEADING, DELIBERATELY. Every page under it already has one — "Security", "Profile &
 * preferences", "Notification preferences" — and a layout that announced "Settings" as an <h1> would either
 * duplicate it or force every page to demote its own title. The container's job is identity and navigation;
 * the page's job is to say what it is.
 *
 * ⚠️ THE HEADER CARRIES THE TWO UNREAD COUNTS, WHICH IS WHY IT IS HERE RATHER THAN ON EACH PAGE. Somebody who
 * came to change their timezone and notices three unread messages should be able to get there in one click
 * from this screen, and the same header serves /notifications and /messages so the numbers are the same on
 * every surface that shows them.
 *
 * The tab bar sits ABOVE the page heading and scrolls horizontally on a narrow screen. Three tabs with real
 * labels still do not fit a phone, and a settings bar that wraps to two lines pushes the content it is meant
 * to introduce below the fold — `.min-w-max` inside an `overflow-x-auto` parent keeps every tab on one line
 * and reachable by swipe, with no scrollbar styling to maintain.
 *
 * NOTHING HERE GUARDS THE SESSION. Each page does its own guard, because each page reads data that belongs to
 * the signed-in account, and a guard in the layout would be a guard the page cannot see when it is later
 * copied elsewhere. The header is omitted entirely for a visitor with no session so a signed-out request never
 * draws a monogram and a name for nobody.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const shell = await getAccountShell();

  return (
    <div className={PAGE_SHELL}>
      {shell.signedIn ? <AccountSettingsHeader shell={shell} /> : null}

      <div className="mt-5">
        <SettingsTabs />
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}

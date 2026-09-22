import SettingsTabs from '@/components/settings/SettingsTabs';
import { PAGE_SHELL } from '@/components/discovery/tokens';

/**
 * The settings container.
 *
 * ⚠️ IT RENDERS NO HEADING, DELIBERATELY. Every page under it already has one — "Active Sessions &
 * Devices" here, and whatever the next settings page is called — and a layout that announced
 * "Settings" as an <h1> would either duplicate it or force every page to demote its own title. The
 * container's job is navigation and the page's job is to say what it is; only the eyebrow is shared,
 * because that is orientation rather than a title.
 *
 * The tab bar sits ABOVE the page heading and scrolls horizontally on a narrow screen. Five tabs
 * with real labels do not fit a phone, and a settings bar that wraps to two lines pushes the content
 * it is meant to introduce below the fold — `.min-w-max` inside an `overflow-x-auto` parent keeps
 * every tab on one line and reachable by swipe, with no scrollbar styling to maintain.
 *
 * Nothing here guards the session. Each page does its own guard, because each page reads data that
 * belongs to the signed-in account, and a guard in the layout would be a guard the page cannot see
 * when it is later copied elsewhere.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={PAGE_SHELL}>
      <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">Settings</p>

      <div className="mt-3">
        <SettingsTabs />
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}

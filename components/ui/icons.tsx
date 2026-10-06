/**
 * icons — the app's icon set, rendered by Iconify.
 *
 * WHY THIS FILE EXISTS. Every icon in the app used to come from `lucide-react`. It now comes from
 * Iconify's lucide collection, behind one module, so a page imports an icon name and never a
 * library API. Swapping the underlying set again is a change to this file only.
 *
 * ⚠️ THE OFFLINE BUILD IS THE POINT. `@iconify/react`'s default `Icon` loads unknown icons from the
 * Iconify API over the network and uses React hooks, which would make every icon a client component
 * and add a third-party request to pages that currently ship no JavaScript. `@iconify/react/offline`
 * renders straight from the bundled icon data with no hooks and no fetching, so an icon stays a
 * plain server-rendered <svg>.
 *
 * ⚠️ THE DATA IS IMPORTED PER ICON. `@iconify-icons/lucide/<name>` brings in that one icon, so the
 * bundle carries only what is used — importing the whole collection would add every lucide icon.
 *
 * PROPS. Each wrapper takes SVG props, so `className="h-4 w-4"`, `aria-hidden` and friends behave
 * exactly as they did with lucide-react. Sizing is by CSS class rather than a `size` prop, which is
 * how every call site already worked. Stroke width lives inside the icon data (lucide's 2px); a
 * call site that needs another weight overrides it with a CSS rule on the inner group.
 *
 * GENERATED, BUT HAND-EDITABLE: the wrappers below were produced from the icon names in use. Adding
 * an icon means adding its data import and a wrapper — and the name can come from any Iconify set,
 * not only lucide.
 */
import { Icon } from '@iconify/react/offline';
import type { IconProps as IconifyProps } from '@iconify/react/offline';
import type { ReactElement } from 'react';

/**
 * What every icon here accepts: Iconify's own props, minus `icon` — each wrapper supplies its own
 * icon data, so a call site only ever passes presentation props (className, aria-hidden, style).
 */
export type IconProps = Omit<IconifyProps, 'icon'>;

/** The shape every icon here has, for props and collections that store one. */
export type IconComponent = (props: IconProps) => ReactElement;

import iconAlertTriangle from '@iconify-icons/lucide/alert-triangle';
import iconArchive from '@iconify-icons/lucide/archive';
import iconArchiveRestore from '@iconify-icons/lucide/archive-restore';
import iconArrowDown from '@iconify-icons/lucide/arrow-down';
import iconArrowLeft from '@iconify-icons/lucide/arrow-left';
import iconArrowRight from '@iconify-icons/lucide/arrow-right';
import iconArrowUp from '@iconify-icons/lucide/arrow-up';
import iconBadgeCheck from '@iconify-icons/lucide/badge-check';
import iconBan from '@iconify-icons/lucide/ban';
import iconBanknote from '@iconify-icons/lucide/banknote';
import iconBarChart3 from '@iconify-icons/lucide/bar-chart-3';
import iconBell from '@iconify-icons/lucide/bell';
import iconBookOpen from '@iconify-icons/lucide/book-open';
import iconBot from '@iconify-icons/lucide/bot';
import iconBoxes from '@iconify-icons/lucide/boxes';
import iconBriefcase from '@iconify-icons/lucide/briefcase';
import iconBuilding2 from '@iconify-icons/lucide/building-2';
import iconCalendarClock from '@iconify-icons/lucide/calendar-clock';
import iconCalendarDays from '@iconify-icons/lucide/calendar-days';
import iconCalendarOff from '@iconify-icons/lucide/calendar-off';
import iconCamera from '@iconify-icons/lucide/camera';
import iconCheck from '@iconify-icons/lucide/check';
import iconCheckCircle2 from '@iconify-icons/lucide/check-circle-2';
import iconChevronDown from '@iconify-icons/lucide/chevron-down';
import iconCircleAlert from '@iconify-icons/lucide/circle-alert';
import iconCircleCheck from '@iconify-icons/lucide/circle-check';
import iconCircleCheckBig from '@iconify-icons/lucide/circle-check-big';
import iconCircleSlash from '@iconify-icons/lucide/circle-slash';
import iconClipboardCheck from '@iconify-icons/lucide/clipboard-check';
import iconClipboardList from '@iconify-icons/lucide/clipboard-list';
import iconClock from '@iconify-icons/lucide/clock';
import iconCloudOff from '@iconify-icons/lucide/cloud-off';
import iconCog from '@iconify-icons/lucide/cog';
import iconCoins from '@iconify-icons/lucide/coins';
import iconCompass from '@iconify-icons/lucide/compass';
import iconCopy from '@iconify-icons/lucide/copy';
import iconCreditCard from '@iconify-icons/lucide/credit-card';
import iconDownload from '@iconify-icons/lucide/download';
import iconDroplets from '@iconify-icons/lucide/droplets';
import iconExternalLink from '@iconify-icons/lucide/external-link';
import iconEye from '@iconify-icons/lucide/eye';
import iconEyeOff from '@iconify-icons/lucide/eye-off';
import iconFileCode2 from '@iconify-icons/lucide/file-code-2';
import iconFileText from '@iconify-icons/lucide/file-text';
import iconFileWarning from '@iconify-icons/lucide/file-warning';
import iconFlag from '@iconify-icons/lucide/flag';
import iconFlaskConical from '@iconify-icons/lucide/flask-conical';
import iconFolderPlus from '@iconify-icons/lucide/folder-plus';
import iconGauge from '@iconify-icons/lucide/gauge';
import iconGavel from '@iconify-icons/lucide/gavel';
import iconGitBranch from '@iconify-icons/lucide/git-branch';
import iconGitMerge from '@iconify-icons/lucide/git-merge';
import iconGlobe2 from '@iconify-icons/lucide/globe-2';
import iconHammer from '@iconify-icons/lucide/hammer';
import iconHardHat from '@iconify-icons/lucide/hard-hat';
import iconHelpCircle from '@iconify-icons/lucide/help-circle';
import iconHistory from '@iconify-icons/lucide/history';
import iconHourglass from '@iconify-icons/lucide/hourglass';
import iconIdCard from '@iconify-icons/lucide/id-card';
import iconImage from '@iconify-icons/lucide/image';
import iconImageUp from '@iconify-icons/lucide/image-up';
import iconInbox from '@iconify-icons/lucide/inbox';
import iconInfo from '@iconify-icons/lucide/info';
import iconKeyRound from '@iconify-icons/lucide/key-round';
import iconLandmark from '@iconify-icons/lucide/landmark';
import iconLanguages from '@iconify-icons/lucide/languages';
import iconLaptop from '@iconify-icons/lucide/laptop';
import iconLayers from '@iconify-icons/lucide/layers';
import iconLayoutDashboard from '@iconify-icons/lucide/layout-dashboard';
import iconLayoutGrid from '@iconify-icons/lucide/layout-grid';
import iconLifeBuoy from '@iconify-icons/lucide/life-buoy';
import iconLightbulb from '@iconify-icons/lucide/lightbulb';
import iconLink2 from '@iconify-icons/lucide/link-2';
import iconList from '@iconify-icons/lucide/list';
import iconLoader2 from '@iconify-icons/lucide/loader-2';
import iconLock from '@iconify-icons/lucide/lock';
import iconLogOut from '@iconify-icons/lucide/log-out';
import iconMail from '@iconify-icons/lucide/mail';
import iconMailCheck from '@iconify-icons/lucide/mail-check';
import iconMap from '@iconify-icons/lucide/map';
import iconMapPin from '@iconify-icons/lucide/map-pin';
import iconMenu from '@iconify-icons/lucide/menu';
import iconMessageSquare from '@iconify-icons/lucide/message-square';
import iconMessageSquareQuote from '@iconify-icons/lucide/message-square-quote';
import iconMessagesSquare from '@iconify-icons/lucide/messages-square';
import iconMic from '@iconify-icons/lucide/mic';
import iconMinus from '@iconify-icons/lucide/minus';
import iconMonitor from '@iconify-icons/lucide/monitor';
import iconNavigation from '@iconify-icons/lucide/navigation';
import iconNotepadText from '@iconify-icons/lucide/notepad-text';
import iconPackage from '@iconify-icons/lucide/package';
import iconPackageCheck from '@iconify-icons/lucide/package-check';
import iconPaintbrush from '@iconify-icons/lucide/paintbrush';
import iconPaperclip from '@iconify-icons/lucide/paperclip';
import iconPause from '@iconify-icons/lucide/pause';
import iconPencil from '@iconify-icons/lucide/pencil';
import iconPencilLine from '@iconify-icons/lucide/pencil-line';
import iconPhone from '@iconify-icons/lucide/phone';
import iconPiggyBank from '@iconify-icons/lucide/piggy-bank';
import iconPlay from '@iconify-icons/lucide/play';
import iconPlugZap from '@iconify-icons/lucide/plug-zap';
import iconPlus from '@iconify-icons/lucide/plus';
import iconPower from '@iconify-icons/lucide/power';
import iconQrCode from '@iconify-icons/lucide/qr-code';
import iconRadio from '@iconify-icons/lucide/radio';
import iconReceiptText from '@iconify-icons/lucide/receipt-text';
import iconRefreshCw from '@iconify-icons/lucide/refresh-cw';
import iconRepeat from '@iconify-icons/lucide/repeat';
import iconRoute from '@iconify-icons/lucide/route';
import iconRuler from '@iconify-icons/lucide/ruler';
import iconSave from '@iconify-icons/lucide/save';
import iconScale from '@iconify-icons/lucide/scale';
import iconScanLine from '@iconify-icons/lucide/scan-line';
import iconScanSearch from '@iconify-icons/lucide/scan-search';
import iconScissors from '@iconify-icons/lucide/scissors';
import iconScrollText from '@iconify-icons/lucide/scroll-text';
import iconSearch from '@iconify-icons/lucide/search';
import iconSearchX from '@iconify-icons/lucide/search-x';
import iconSend from '@iconify-icons/lucide/send';
import iconSettings from '@iconify-icons/lucide/settings';
import iconShieldAlert from '@iconify-icons/lucide/shield-alert';
import iconShieldCheck from '@iconify-icons/lucide/shield-check';
import iconShieldQuestion from '@iconify-icons/lucide/shield-question';
import iconSiren from '@iconify-icons/lucide/siren';
import iconSlidersHorizontal from '@iconify-icons/lucide/sliders-horizontal';
import iconSmartphone from '@iconify-icons/lucide/smartphone';
import iconSparkles from '@iconify-icons/lucide/sparkles';
import iconSquare from '@iconify-icons/lucide/square';
import iconStar from '@iconify-icons/lucide/star';
import iconTablet from '@iconify-icons/lucide/tablet';
import iconTag from '@iconify-icons/lucide/tag';
import iconThermometer from '@iconify-icons/lucide/thermometer';
import iconTimer from '@iconify-icons/lucide/timer';
import iconTimerOff from '@iconify-icons/lucide/timer-off';
import iconTrash2 from '@iconify-icons/lucide/trash-2';
import iconTrendingUp from '@iconify-icons/lucide/trending-up';
import iconTriangleAlert from '@iconify-icons/lucide/triangle-alert';
import iconTruck from '@iconify-icons/lucide/truck';
import iconUndo2 from '@iconify-icons/lucide/undo-2';
import iconUpload from '@iconify-icons/lucide/upload';
import iconUser from '@iconify-icons/lucide/user';
import iconUserCog from '@iconify-icons/lucide/user-cog';
import iconUserMinus from '@iconify-icons/lucide/user-minus';
import iconUserPlus from '@iconify-icons/lucide/user-plus';
import iconUserRound from '@iconify-icons/lucide/user-round';
import iconUsers from '@iconify-icons/lucide/users';
import iconUsersRound from '@iconify-icons/lucide/users-round';
import iconWallet from '@iconify-icons/lucide/wallet';
import iconWind from '@iconify-icons/lucide/wind';
import iconWrench from '@iconify-icons/lucide/wrench';
import iconX from '@iconify-icons/lucide/x';
import iconXCircle from '@iconify-icons/lucide/x-circle';
import iconZap from '@iconify-icons/lucide/zap';

export function AlertTriangle(props: IconProps): ReactElement {
  return <Icon icon={iconAlertTriangle} {...props} />;
}

export function Archive(props: IconProps): ReactElement {
  return <Icon icon={iconArchive} {...props} />;
}

export function ArchiveRestore(props: IconProps): ReactElement {
  return <Icon icon={iconArchiveRestore} {...props} />;
}

export function ArrowDown(props: IconProps): ReactElement {
  return <Icon icon={iconArrowDown} {...props} />;
}

export function ArrowLeft(props: IconProps): ReactElement {
  return <Icon icon={iconArrowLeft} {...props} />;
}

export function ArrowRight(props: IconProps): ReactElement {
  return <Icon icon={iconArrowRight} {...props} />;
}

export function ArrowUp(props: IconProps): ReactElement {
  return <Icon icon={iconArrowUp} {...props} />;
}

export function BadgeCheck(props: IconProps): ReactElement {
  return <Icon icon={iconBadgeCheck} {...props} />;
}

export function Ban(props: IconProps): ReactElement {
  return <Icon icon={iconBan} {...props} />;
}

export function Banknote(props: IconProps): ReactElement {
  return <Icon icon={iconBanknote} {...props} />;
}

export function BarChart3(props: IconProps): ReactElement {
  return <Icon icon={iconBarChart3} {...props} />;
}

export function Bell(props: IconProps): ReactElement {
  return <Icon icon={iconBell} {...props} />;
}

export function BookOpen(props: IconProps): ReactElement {
  return <Icon icon={iconBookOpen} {...props} />;
}

export function Bot(props: IconProps): ReactElement {
  return <Icon icon={iconBot} {...props} />;
}

export function Boxes(props: IconProps): ReactElement {
  return <Icon icon={iconBoxes} {...props} />;
}

export function Briefcase(props: IconProps): ReactElement {
  return <Icon icon={iconBriefcase} {...props} />;
}

export function Building2(props: IconProps): ReactElement {
  return <Icon icon={iconBuilding2} {...props} />;
}

export function CalendarClock(props: IconProps): ReactElement {
  return <Icon icon={iconCalendarClock} {...props} />;
}

export function CalendarDays(props: IconProps): ReactElement {
  return <Icon icon={iconCalendarDays} {...props} />;
}

export function CalendarOff(props: IconProps): ReactElement {
  return <Icon icon={iconCalendarOff} {...props} />;
}

export function Camera(props: IconProps): ReactElement {
  return <Icon icon={iconCamera} {...props} />;
}

export function Check(props: IconProps): ReactElement {
  return <Icon icon={iconCheck} {...props} />;
}

export function CheckCircle2(props: IconProps): ReactElement {
  return <Icon icon={iconCheckCircle2} {...props} />;
}

export function ChevronDown(props: IconProps): ReactElement {
  return <Icon icon={iconChevronDown} {...props} />;
}

export function CircleAlert(props: IconProps): ReactElement {
  return <Icon icon={iconCircleAlert} {...props} />;
}

export function CircleCheck(props: IconProps): ReactElement {
  return <Icon icon={iconCircleCheck} {...props} />;
}

export function CircleCheckBig(props: IconProps): ReactElement {
  return <Icon icon={iconCircleCheckBig} {...props} />;
}

export function CircleSlash(props: IconProps): ReactElement {
  return <Icon icon={iconCircleSlash} {...props} />;
}

export function ClipboardCheck(props: IconProps): ReactElement {
  return <Icon icon={iconClipboardCheck} {...props} />;
}

export function ClipboardList(props: IconProps): ReactElement {
  return <Icon icon={iconClipboardList} {...props} />;
}

export function Clock(props: IconProps): ReactElement {
  return <Icon icon={iconClock} {...props} />;
}

export function CloudOff(props: IconProps): ReactElement {
  return <Icon icon={iconCloudOff} {...props} />;
}

export function Cog(props: IconProps): ReactElement {
  return <Icon icon={iconCog} {...props} />;
}

export function Coins(props: IconProps): ReactElement {
  return <Icon icon={iconCoins} {...props} />;
}

export function Compass(props: IconProps): ReactElement {
  return <Icon icon={iconCompass} {...props} />;
}

export function Copy(props: IconProps): ReactElement {
  return <Icon icon={iconCopy} {...props} />;
}

export function CreditCard(props: IconProps): ReactElement {
  return <Icon icon={iconCreditCard} {...props} />;
}

export function Download(props: IconProps): ReactElement {
  return <Icon icon={iconDownload} {...props} />;
}

export function Droplets(props: IconProps): ReactElement {
  return <Icon icon={iconDroplets} {...props} />;
}

export function ExternalLink(props: IconProps): ReactElement {
  return <Icon icon={iconExternalLink} {...props} />;
}

export function Eye(props: IconProps): ReactElement {
  return <Icon icon={iconEye} {...props} />;
}

export function EyeOff(props: IconProps): ReactElement {
  return <Icon icon={iconEyeOff} {...props} />;
}

export function FileCode2(props: IconProps): ReactElement {
  return <Icon icon={iconFileCode2} {...props} />;
}

export function FileText(props: IconProps): ReactElement {
  return <Icon icon={iconFileText} {...props} />;
}

export function FileWarning(props: IconProps): ReactElement {
  return <Icon icon={iconFileWarning} {...props} />;
}

export function Flag(props: IconProps): ReactElement {
  return <Icon icon={iconFlag} {...props} />;
}

export function FlaskConical(props: IconProps): ReactElement {
  return <Icon icon={iconFlaskConical} {...props} />;
}

export function FolderPlus(props: IconProps): ReactElement {
  return <Icon icon={iconFolderPlus} {...props} />;
}

export function Gauge(props: IconProps): ReactElement {
  return <Icon icon={iconGauge} {...props} />;
}

export function Gavel(props: IconProps): ReactElement {
  return <Icon icon={iconGavel} {...props} />;
}

export function GitBranch(props: IconProps): ReactElement {
  return <Icon icon={iconGitBranch} {...props} />;
}

export function GitMerge(props: IconProps): ReactElement {
  return <Icon icon={iconGitMerge} {...props} />;
}

export function Globe2(props: IconProps): ReactElement {
  return <Icon icon={iconGlobe2} {...props} />;
}

export function Hammer(props: IconProps): ReactElement {
  return <Icon icon={iconHammer} {...props} />;
}

export function HardHat(props: IconProps): ReactElement {
  return <Icon icon={iconHardHat} {...props} />;
}

export function HelpCircle(props: IconProps): ReactElement {
  return <Icon icon={iconHelpCircle} {...props} />;
}

export function History(props: IconProps): ReactElement {
  return <Icon icon={iconHistory} {...props} />;
}

export function Hourglass(props: IconProps): ReactElement {
  return <Icon icon={iconHourglass} {...props} />;
}

export function IdCard(props: IconProps): ReactElement {
  return <Icon icon={iconIdCard} {...props} />;
}

export function Image(props: IconProps): ReactElement {
  return <Icon icon={iconImage} {...props} />;
}

export function ImageUp(props: IconProps): ReactElement {
  return <Icon icon={iconImageUp} {...props} />;
}

export function Inbox(props: IconProps): ReactElement {
  return <Icon icon={iconInbox} {...props} />;
}

export function Info(props: IconProps): ReactElement {
  return <Icon icon={iconInfo} {...props} />;
}

export function KeyRound(props: IconProps): ReactElement {
  return <Icon icon={iconKeyRound} {...props} />;
}

export function Landmark(props: IconProps): ReactElement {
  return <Icon icon={iconLandmark} {...props} />;
}

export function Languages(props: IconProps): ReactElement {
  return <Icon icon={iconLanguages} {...props} />;
}

export function Laptop(props: IconProps): ReactElement {
  return <Icon icon={iconLaptop} {...props} />;
}

export function Layers(props: IconProps): ReactElement {
  return <Icon icon={iconLayers} {...props} />;
}

export function LayoutDashboard(props: IconProps): ReactElement {
  return <Icon icon={iconLayoutDashboard} {...props} />;
}

export function LayoutGrid(props: IconProps): ReactElement {
  return <Icon icon={iconLayoutGrid} {...props} />;
}

export function LifeBuoy(props: IconProps): ReactElement {
  return <Icon icon={iconLifeBuoy} {...props} />;
}

export function Lightbulb(props: IconProps): ReactElement {
  return <Icon icon={iconLightbulb} {...props} />;
}

export function Link2(props: IconProps): ReactElement {
  return <Icon icon={iconLink2} {...props} />;
}

export function List(props: IconProps): ReactElement {
  return <Icon icon={iconList} {...props} />;
}

export function Loader2(props: IconProps): ReactElement {
  return <Icon icon={iconLoader2} {...props} />;
}

export function Lock(props: IconProps): ReactElement {
  return <Icon icon={iconLock} {...props} />;
}

export function LogOut(props: IconProps): ReactElement {
  return <Icon icon={iconLogOut} {...props} />;
}

export function Mail(props: IconProps): ReactElement {
  return <Icon icon={iconMail} {...props} />;
}

export function MailCheck(props: IconProps): ReactElement {
  return <Icon icon={iconMailCheck} {...props} />;
}

export function Map(props: IconProps): ReactElement {
  return <Icon icon={iconMap} {...props} />;
}

export function MapPin(props: IconProps): ReactElement {
  return <Icon icon={iconMapPin} {...props} />;
}

export function Menu(props: IconProps): ReactElement {
  return <Icon icon={iconMenu} {...props} />;
}

export function MessageSquare(props: IconProps): ReactElement {
  return <Icon icon={iconMessageSquare} {...props} />;
}

export function MessageSquareQuote(props: IconProps): ReactElement {
  return <Icon icon={iconMessageSquareQuote} {...props} />;
}

export function MessagesSquare(props: IconProps): ReactElement {
  return <Icon icon={iconMessagesSquare} {...props} />;
}

export function Mic(props: IconProps): ReactElement {
  return <Icon icon={iconMic} {...props} />;
}

export function Minus(props: IconProps): ReactElement {
  return <Icon icon={iconMinus} {...props} />;
}

export function Monitor(props: IconProps): ReactElement {
  return <Icon icon={iconMonitor} {...props} />;
}

export function Navigation(props: IconProps): ReactElement {
  return <Icon icon={iconNavigation} {...props} />;
}

export function NotepadText(props: IconProps): ReactElement {
  return <Icon icon={iconNotepadText} {...props} />;
}

export function Package(props: IconProps): ReactElement {
  return <Icon icon={iconPackage} {...props} />;
}

export function PackageCheck(props: IconProps): ReactElement {
  return <Icon icon={iconPackageCheck} {...props} />;
}

export function Paintbrush(props: IconProps): ReactElement {
  return <Icon icon={iconPaintbrush} {...props} />;
}

export function Paperclip(props: IconProps): ReactElement {
  return <Icon icon={iconPaperclip} {...props} />;
}

export function Pause(props: IconProps): ReactElement {
  return <Icon icon={iconPause} {...props} />;
}

export function Pencil(props: IconProps): ReactElement {
  return <Icon icon={iconPencil} {...props} />;
}

export function PencilLine(props: IconProps): ReactElement {
  return <Icon icon={iconPencilLine} {...props} />;
}

export function Phone(props: IconProps): ReactElement {
  return <Icon icon={iconPhone} {...props} />;
}

export function PiggyBank(props: IconProps): ReactElement {
  return <Icon icon={iconPiggyBank} {...props} />;
}

export function Play(props: IconProps): ReactElement {
  return <Icon icon={iconPlay} {...props} />;
}

export function PlugZap(props: IconProps): ReactElement {
  return <Icon icon={iconPlugZap} {...props} />;
}

export function Plus(props: IconProps): ReactElement {
  return <Icon icon={iconPlus} {...props} />;
}

export function Power(props: IconProps): ReactElement {
  return <Icon icon={iconPower} {...props} />;
}

export function QrCode(props: IconProps): ReactElement {
  return <Icon icon={iconQrCode} {...props} />;
}

export function Radio(props: IconProps): ReactElement {
  return <Icon icon={iconRadio} {...props} />;
}

export function ReceiptText(props: IconProps): ReactElement {
  return <Icon icon={iconReceiptText} {...props} />;
}

export function RefreshCw(props: IconProps): ReactElement {
  return <Icon icon={iconRefreshCw} {...props} />;
}

export function Repeat(props: IconProps): ReactElement {
  return <Icon icon={iconRepeat} {...props} />;
}

export function Route(props: IconProps): ReactElement {
  return <Icon icon={iconRoute} {...props} />;
}

export function Ruler(props: IconProps): ReactElement {
  return <Icon icon={iconRuler} {...props} />;
}

export function Save(props: IconProps): ReactElement {
  return <Icon icon={iconSave} {...props} />;
}

export function Scale(props: IconProps): ReactElement {
  return <Icon icon={iconScale} {...props} />;
}

export function ScanLine(props: IconProps): ReactElement {
  return <Icon icon={iconScanLine} {...props} />;
}

export function ScanSearch(props: IconProps): ReactElement {
  return <Icon icon={iconScanSearch} {...props} />;
}

export function Scissors(props: IconProps): ReactElement {
  return <Icon icon={iconScissors} {...props} />;
}

export function ScrollText(props: IconProps): ReactElement {
  return <Icon icon={iconScrollText} {...props} />;
}

export function Search(props: IconProps): ReactElement {
  return <Icon icon={iconSearch} {...props} />;
}

export function SearchX(props: IconProps): ReactElement {
  return <Icon icon={iconSearchX} {...props} />;
}

export function Send(props: IconProps): ReactElement {
  return <Icon icon={iconSend} {...props} />;
}

export function Settings(props: IconProps): ReactElement {
  return <Icon icon={iconSettings} {...props} />;
}

export function ShieldAlert(props: IconProps): ReactElement {
  return <Icon icon={iconShieldAlert} {...props} />;
}

export function ShieldCheck(props: IconProps): ReactElement {
  return <Icon icon={iconShieldCheck} {...props} />;
}

export function ShieldQuestion(props: IconProps): ReactElement {
  return <Icon icon={iconShieldQuestion} {...props} />;
}

export function Siren(props: IconProps): ReactElement {
  return <Icon icon={iconSiren} {...props} />;
}

export function SlidersHorizontal(props: IconProps): ReactElement {
  return <Icon icon={iconSlidersHorizontal} {...props} />;
}

export function Smartphone(props: IconProps): ReactElement {
  return <Icon icon={iconSmartphone} {...props} />;
}

export function Sparkles(props: IconProps): ReactElement {
  return <Icon icon={iconSparkles} {...props} />;
}

export function Square(props: IconProps): ReactElement {
  return <Icon icon={iconSquare} {...props} />;
}

export function Star(props: IconProps): ReactElement {
  return <Icon icon={iconStar} {...props} />;
}

export function Tablet(props: IconProps): ReactElement {
  return <Icon icon={iconTablet} {...props} />;
}

export function Tag(props: IconProps): ReactElement {
  return <Icon icon={iconTag} {...props} />;
}

export function Thermometer(props: IconProps): ReactElement {
  return <Icon icon={iconThermometer} {...props} />;
}

export function Timer(props: IconProps): ReactElement {
  return <Icon icon={iconTimer} {...props} />;
}

export function TimerOff(props: IconProps): ReactElement {
  return <Icon icon={iconTimerOff} {...props} />;
}

export function Trash2(props: IconProps): ReactElement {
  return <Icon icon={iconTrash2} {...props} />;
}

export function TrendingUp(props: IconProps): ReactElement {
  return <Icon icon={iconTrendingUp} {...props} />;
}

export function TriangleAlert(props: IconProps): ReactElement {
  return <Icon icon={iconTriangleAlert} {...props} />;
}

export function Truck(props: IconProps): ReactElement {
  return <Icon icon={iconTruck} {...props} />;
}

export function Undo2(props: IconProps): ReactElement {
  return <Icon icon={iconUndo2} {...props} />;
}

export function Upload(props: IconProps): ReactElement {
  return <Icon icon={iconUpload} {...props} />;
}

export function User(props: IconProps): ReactElement {
  return <Icon icon={iconUser} {...props} />;
}

export function UserCog(props: IconProps): ReactElement {
  return <Icon icon={iconUserCog} {...props} />;
}

export function UserMinus(props: IconProps): ReactElement {
  return <Icon icon={iconUserMinus} {...props} />;
}

export function UserPlus(props: IconProps): ReactElement {
  return <Icon icon={iconUserPlus} {...props} />;
}

export function UserRound(props: IconProps): ReactElement {
  return <Icon icon={iconUserRound} {...props} />;
}

export function Users(props: IconProps): ReactElement {
  return <Icon icon={iconUsers} {...props} />;
}

export function UsersRound(props: IconProps): ReactElement {
  return <Icon icon={iconUsersRound} {...props} />;
}

export function Wallet(props: IconProps): ReactElement {
  return <Icon icon={iconWallet} {...props} />;
}

export function Wind(props: IconProps): ReactElement {
  return <Icon icon={iconWind} {...props} />;
}

export function Wrench(props: IconProps): ReactElement {
  return <Icon icon={iconWrench} {...props} />;
}

export function X(props: IconProps): ReactElement {
  return <Icon icon={iconX} {...props} />;
}

export function XCircle(props: IconProps): ReactElement {
  return <Icon icon={iconXCircle} {...props} />;
}

export function Zap(props: IconProps): ReactElement {
  return <Icon icon={iconZap} {...props} />;
}

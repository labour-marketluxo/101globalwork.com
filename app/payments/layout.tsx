import SiteChrome from '@/components/navigation/SiteChrome';

/**
 * The payment return landing keeps the public chrome, as it had before.
 *
 * /payments/paystack/return is where the provider sends a payer back to after checkout, and it
 * reads the transaction state and sends them on to the work they paid for. It sits outside the
 * (app) group only because it is reached by an external redirect rather than by a link inside
 * the workspace.
 *
 * app/layout.tsx no longer draws a header or a footer, so without this file the page a customer
 * lands on immediately after paying would be the one page in the app with no navigation. It is
 * a small file with a specific job: keeping the most disoriented moment in the flow from also
 * being the barest.
 */
export default function PaymentsLayout({ children }: { children: React.ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Info } from '@/components/ui/icons';
import {
  ComparisonCard,
  ComparisonEmpty,
  ComparisonMatrix,
  DecisionNotice,
} from '@/components/customer/QuoteSections';
import { CARD, LINK_ARROW } from '@/components/discovery/tokens';
import { groupQuotes, quoteActionability } from '@/features/customer/quotes';
import { getCustomerRequestDetail } from '@/features/customer/requests';

export const metadata = {
  title: 'Compare quotes',
  robots: { index: false, follow: false },
};

/**
 * Quote comparison — the side-by-side decision page.
 *
 * ⚠️ TWO VIEWS, ONE SET OF ANSWERS. Wide screens get the table, where the same attribute sits on one row for
 * every provider and the attribute column stays put while the providers scroll. Narrow screens get cards,
 * because a nine-attribute table at 360px is a horizontal scrollbar with the price off the edge. Both call the
 * same `quoteAttributes` helper and the same decision controls, so the two layouts cannot disagree — only
 * present the same comparison differently.
 *
 * ⚠️ THE BREAKPOINT IS THE LAYOUT, NOT TWO PAGES. They are both in this DOM; `lg:hidden` / `hidden lg:block`
 * choose which one is painted. Printing or reading the page without CSS therefore exposes both, which is a
 * better failure than losing the comparison.
 */
export default async function QuoteComparisonPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ failed?: string; decided?: string }>;
}) {
  const { requestId } = await params;
  const query = await searchParams;

  const request = await getCustomerRequestDetail(requestId);
  if (!request) notFound();

  const groups = groupQuotes(request.quotes);
  const hasActiveAssignment = Boolean(request.assignment);
  const versionCount = request.quotes.length;

  const openCount = groups.filter(group =>
    quoteActionability(group.latest, { requestState: request.state, hasActiveAssignment }).canAccept).length;

  return (
    <section>
      <DecisionNotice failed={query.failed} decided={query.decided} />

      <header className="mb-6">
        <nav aria-label="Quote comparison" className="flex flex-wrap items-center gap-2 text-xs">
          <Link href={`/customer/requests/${request.id}`} className={LINK_ARROW}>
            ← Back to the request
          </Link>
        </nav>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-primary sm:text-3xl">Compare quotes</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          {groups.length === 0
            ? 'No provider has quoted this request yet.'
            : `${groups.length} provider${groups.length === 1 ? '' : 's'} quoted this request across ${versionCount} version${versionCount === 1 ? '' : 's'}. ${
                openCount > 0
                  ? `${openCount} can be accepted right now.`
                  : 'None can be accepted right now — each card says why.'
              }`}
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Accepting a quote locks that version, declines every other quote on the request, and creates the
          payment obligation. You read and sign the agreement straight afterwards, and nothing is charged until
          you fund it.
        </p>
      </header>

      {groups.length === 0 ? (
        <ComparisonEmpty requestId={request.id} hasQuotes={request.quotes.length > 0} />
      ) : (
        <>
          <div className="hidden lg:block">
            <ComparisonMatrix
              groups={groups}
              requestId={request.id}
              requestState={request.state}
              hasActiveAssignment={hasActiveAssignment}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:hidden">
            {groups.map(group => (
              <ComparisonCard
                key={group.providerId}
                group={group}
                requestId={request.id}
                requestState={request.state}
                hasActiveAssignment={hasActiveAssignment}
              />
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className={`${CARD} p-5`}>
              <h2 className="flex items-center gap-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <Info aria-hidden="true" className="h-4 w-4 text-slate-400" />
                What these terms are, and what the platform does with them
              </h2>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
                <li>
                  · Every attribute above is something the provider typed on their own quote form. &ldquo;Not
                  stated&rdquo; means they left it blank — it is not the platform&apos;s answer and it is not a
                  &ldquo;no&rdquo;.
                </li>
                <li>
                  · The itemised lines and the taxes have to add up to the total. The database refuses a quote
                  where they do not, so a breakdown that disagrees with the price is not a rounding difference
                  you have to spot.
                </li>
                <li>
                  · Optional add-ons sit outside the total on purpose. Nothing is charged for one until you ask
                  the provider for it.
                </li>
                <li>
                  · Warranty terms are the provider&apos;s own words. The platform records them and enforces
                  none of them — there is no warranty model behind this field.
                </li>
                <li>
                  · The accepted version is locked and cannot be edited, and a later re-price is a new version
                  rather than a change to this one.
                </li>
              </ul>
            </section>

            <section className={`${CARD} p-5`}>
              <h2 className="flex items-center gap-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <Info aria-hidden="true" className="h-4 w-4 text-slate-400" />
                How this comparison is ordered and what it leaves out
              </h2>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
                <li>
                  · Cards are ordered cheapest current version first. They are NOT ordered by who paid for
                  placement, because nothing on this platform can be paid for placement.
                </li>
                <li>
                  · Only each provider&apos;s CURRENT version is compared. Earlier versions are kept on the
                  quote&apos;s own page as history, and the database refuses to accept one that has been
                  replaced.
                </li>
                <li>
                  · A quote past its validity date cannot be accepted, and the card says so instead of offering
                  a button that would fail.
                </li>
                <li>
                  · Nothing on this page sends a message to a provider. A revision request or a clarification
                  is recorded against the quote and read by them on their own view.
                </li>
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                The request itself, with the matching status and the providers who were eligible but have not
                quoted, is on{' '}
                <Link href={`/customer/requests/${request.id}`} className={LINK_ARROW}>
                  the request page <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
                .
              </p>
            </section>
          </div>
        </>
      )}
    </section>
  );
}

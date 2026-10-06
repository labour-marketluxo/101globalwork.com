import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CircleCheck,
  FileWarning,
  History,
  Lock,
  MessageSquare,
  ReceiptText,
  TriangleAlert,
} from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import ConfirmSubmit from '@/components/ui/ConfirmSubmit';
import { PendingButton } from '@/components/provider/ProviderControls';
import { QuotePricingFields, SUGGESTED_LINE_LABELS, type SeedRow } from '@/components/provider/QuotePricingFields';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';
import { formatMoney } from '@/features/provider-workspace/format';
import type { QuoteDiff, ProviderQuote, QuoteChangeRequest, QuoteRequestHeader } from '@/features/provider-workspace/quotes';
import {
  discardQuoteDraftAction,
  requestInspectionAction,
  saveQuoteDraftAction,
  sendQuoteMessageAction,
  submitQuoteAction,
  withdrawQuoteAction,
} from '@/features/provider-workspace/actions';

/**
 * The quote builder and the quote document, for the provider's side.
 *
 * ⚠️ THE TOTAL ON SCREEN IS AN ESTIMATE; THE TOTAL THAT COUNTS IS COMPUTED TWICE MORE. `QuotePricingFields`
 * adds the rows in the browser so the provider can see what they are about to charge, the action adds them
 * again on the server, and a database trigger checks that sum against the stored total. A form that posted its
 * own total could post one that disagrees with the breakdown the customer reads — which is why no field on this
 * page carries a total.
 *
 * ⚠️ "SAVE DRAFT" IS A SECOND BUTTON ON ONE FORM, NOT A SECOND FORM. Drafts and submissions differ in
 * strictness, not in shape: the same fields go to two commands. Two forms on one page would also mean two sets
 * of inputs with the same values, and the pair would drift the first time somebody added a field to one of them.
 */

type DraftPayload = {
  line_items?: { label?: string; amount?: string }[];
  addons?: { label?: string; amount?: string }[];
  taxes?: string;
  summary?: string;
  materials?: string;
  materials_note?: string;
  exclusions?: string;
  timeline_days?: string;
  timeline_note?: string;
  inspection?: string;
  warranty?: string;
  valid_until?: string;
};

function seededRows(draft: DraftPayload | null, previous: ProviderQuote | null): SeedRow[] | undefined {
  const fromDraft = draft?.line_items;
  if (fromDraft && fromDraft.length > 0) {
    return fromDraft.map(item => ({ label: String(item.label ?? ''), amount: String(item.amount ?? '') }));
  }
  if (previous) {
    return previous.lineItems.map(item => ({ label: item.label, amount: (item.amountMinor / 100).toString() }));
  }
  return SUGGESTED_LINE_LABELS.map(label => ({ label, amount: '' }));
}

function seededAddons(draft: DraftPayload | null, previous: ProviderQuote | null): SeedRow[] | undefined {
  const fromDraft = draft?.addons;
  if (fromDraft && fromDraft.length > 0) {
    return fromDraft.map(item => ({ label: String(item.label ?? ''), amount: String(item.amount ?? '') }));
  }
  if (previous) {
    return previous.addons.map(item => ({ label: item.label, amount: (item.amountMinor / 100).toString() }));
  }
  return undefined;
}

export function QuoteBuilderForm({
  request,
  providerId,
  draft,
  previous,
  resumedFrom,
}: {
  request: QuoteRequestHeader;
  providerId: string;
  draft: DraftPayload | null;
  /** The version a "revised quote" starts from: a new version is pre-filled from the last one, never edited. */
  previous: ProviderQuote | null;
  resumedFrom: 'draft' | 'revision' | 'suggestions';
}) {
  const from = previous ? seededRows(draft, previous) : seededRows(draft, null);
  const currency = previous?.currencyCode ?? request.currencyCode ?? 'NGN';
  /**
   * Where the draft and inspection actions come back to.
   *
   * ⚠️ IT CARRIES `?request=` AND `?from=`, because landing back on a bare /provider/quotes/new after saving a
   * draft would be a page that has forgotten which request it is about — the one thing the builder cannot
   * recover on its own.
   */
  const selfPath = `${PROVIDER_PATHS.quotesNew}?request=${request.id}${previous ? `&from=${previous.id}` : ''}`;

  return (
    <form action={submitQuoteAction} className={`${CARD} grid gap-5 p-5`}>
      <input type="hidden" name="provider_id" value={providerId} />
      <input type="hidden" name="request_id" value={request.id} />
      <input type="hidden" name="currency_code" value={currency} />
      <input type="hidden" name="next" value={selfPath} />

      {resumedFrom === 'draft' ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface p-3.5 text-xs leading-relaxed text-slate-600">
          Opened from your saved draft. Nothing here has been sent to the customer — a draft is only visible to
          you, and it is deleted once a quote is submitted from this page.
        </p>
      ) : null}
      {resumedFrom === 'revision' && previous ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface p-3.5 text-xs leading-relaxed text-slate-600">
          Pre-filled from {previous.version}. Submitting creates a NEW version beside it — the earlier one stays
          exactly as the customer first read it, because a price somebody may already have decided on cannot be
          quietly rewritten.
        </p>
      ) : null}

      <QuotePricingFields
        currency={currency}
        initialLines={from}
        initialAddons={seededAddons(draft, previous)}
        initialTaxes={draft?.taxes ?? (previous ? (previous.taxesMinor / 100).toString() : undefined)}
      />

      {/**
       * The two things the brief asks for that this platform does NOT have, said plainly rather than rendered
       * as an empty box.
       *
       * ⚠️ THERE IS NO PLATFORM FEE TO BREAK DOWN. `FEE_POLICY.published` is false and no fee schedule is in
       * force, so a "platform fee" line would be a charge invented by a UI. The pricing page says the same
       * thing to customers, and the quote comparison says it beside every total.
       *
       * ⚠️ THERE ARE NO CUSTOM PAYMENT TERMS. `payment_obligations` is one row per assignment, so the platform
       * can express "funded" or "not funded" and cannot express a deposit, a stage payment or an instalment
       * plan. A free-text "payment terms" box would be a promise the platform's own payment path would not
       * honour — the exact failure this codebase refuses elsewhere.
       */}
      <div className="rounded-xl border border-solid border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600">
        <p className="font-semibold text-slate-800">Fees and payment, as this platform actually works</p>
        <p className="mt-1">
          The platform adds no fee of its own to this quote — there is no fee schedule in force, and the pricing
          page tells customers the same thing. Your total is the whole of what the customer is charged.
        </p>
        <p className="mt-1">
          Payment for accepted paid work is a single funded obligation: the customer funds it before work starts,
          and the platform has no way to record a deposit, a stage payment or an instalment plan. Anything you
          want to say about staged payment belongs in the description above as a condition of your offer, not as
          a term the platform will enforce.
        </p>
      </div>

      <div>
        <label htmlFor="summary" className={LABEL}>
          What is included
        </label>
        <textarea
          id="summary"
          name="summary"
          rows={6}
          required
          minLength={20}
          maxLength={2000}
          defaultValue={draft?.summary ?? previous?.summary ?? ''}
          placeholder="Describe the work included, the important materials or assumptions, and anything excluded from this price."
          className={FIELD}
        />
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          At least 20 characters. This is the text the customer relies on when deciding, so be specific about
          what the money buys.
        </p>
      </div>

      <fieldset className="grid gap-4 border-t border-solid border-slate-200 pt-4">
        <legend className={LABEL}>Terms the customer compares</legend>
        <p className="text-xs leading-relaxed text-slate-500">
          The customer sees these beside every other quote, so a blank field reads as &ldquo;this provider did not
          say&rdquo;. Fill in what you can honestly answer.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="materials" className={LABEL}>
              Materials
            </label>
            <select
              id="materials"
              name="materials"
              defaultValue={draft?.materials ?? (previous?.materialsIncluded === true ? 'included' : previous?.materialsIncluded === false ? 'excluded' : '')}
              className={FIELD}
            >
              <option value="">Not stated</option>
              <option value="included">Included in the price</option>
              <option value="excluded">Charged on top / supplied by the customer</option>
            </select>
          </div>
          <div>
            <label htmlFor="materials_note" className={LABEL}>
              Materials note (optional)
            </label>
            <input
              id="materials_note"
              name="materials_note"
              maxLength={2000}
              defaultValue={draft?.materials_note ?? previous?.materialsNote ?? ''}
              placeholder="e.g. Standard fittings included; a ceramic cartridge would be extra."
              className={FIELD}
            />
          </div>
        </div>

        <div>
          <label htmlFor="exclusions" className={LABEL}>
            What this price does NOT cover (optional)
          </label>
          <textarea
            id="exclusions"
            name="exclusions"
            rows={3}
            maxLength={2000}
            defaultValue={draft?.exclusions ?? previous?.exclusions ?? ''}
            placeholder="e.g. Does not include re-tiling, or any work inside the wall cavity."
            className={FIELD}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="timeline_days" className={LABEL}>
              Working days the work takes (optional)
            </label>
            <input
              id="timeline_days"
              name="timeline_days"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              defaultValue={draft?.timeline_days ?? (previous?.timelineDays ? String(previous.timelineDays) : '')}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="timeline_note" className={LABEL}>
              Timeline note (optional)
            </label>
            <input
              id="timeline_note"
              name="timeline_note"
              maxLength={2000}
              defaultValue={draft?.timeline_note ?? previous?.timelineNote ?? ''}
              placeholder="e.g. Starts within three days of acceptance."
              className={FIELD}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="inspection" className={LABEL}>
              Before the quoted work can proceed
            </label>
            <select
              id="inspection"
              name="inspection"
              defaultValue={draft?.inspection ?? (previous?.inspectionRequired === true ? 'required' : previous?.inspectionRequired === false ? 'not_required' : '')}
              className={FIELD}
            >
              <option value="">Not stated</option>
              <option value="required">An inspection is required first</option>
              <option value="not_required">No inspection needed</option>
            </select>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              This is a term on a price you are sending now. If you need to look before you can price at all, use
              &ldquo;Request an on-site inspection&rdquo; below instead.
            </p>
          </div>
          <div>
            <label htmlFor="valid_until" className={LABEL}>
              Quote valid until (optional)
            </label>
            <input
              id="valid_until"
              name="valid_until"
              type="datetime-local"
              defaultValue={draft?.valid_until ?? ''}
              className={FIELD}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              After this date the platform shows the quote as past its validity. It does not change the status on
              its own, and it never withdraws an offer for you.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="warranty" className={LABEL}>
            Warranty you are offering (optional)
          </label>
          <textarea
            id="warranty"
            name="warranty"
            rows={3}
            maxLength={2000}
            defaultValue={draft?.warranty ?? previous?.warrantyTerms ?? ''}
            placeholder="e.g. Twelve months on the parts I supply and the workmanship. Say it in your own words — the platform records this, it does not enforce it."
            className={FIELD}
          />
        </div>
      </fieldset>

      <div className="grid gap-3 border-t border-solid border-slate-200 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <PendingButton
            idle="Submit quotation"
            pending="Submitting…"
            icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
            className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-6 py-3 font-sans text-sm font-bold tracking-wide text-white shadow-lg shadow-amber-950/20 transition-all hover:bg-secondary-dark active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
          />
          <PendingButton
            idle="Save draft"
            pending="Saving…"
            formAction={saveQuoteDraftAction}
            className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
          {draft ? (
            <PendingButton
              idle="Discard draft"
              pending="Discarding…"
              formAction={discardQuoteDraftAction}
              className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            />
          ) : null}
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          Submitting sends this to the customer and cannot be taken back — withdrawing is a separate action on
          the quote itself, and an accepted quote cannot be withdrawn at all.
        </p>
      </div>

      <div className="grid gap-3 border-t border-solid border-slate-200 pt-4">
        <label htmlFor="inspection_note" className={LABEL}>
          Request an on-site inspection first (optional note)
        </label>
        <input
          id="inspection_note"
          name="inspection_note"
          maxLength={2000}
          placeholder="e.g. I need to see the roof before I can price the replacement."
          className={FIELD}
        />
        <div className="flex flex-wrap items-center gap-3">
          <PendingButton
            idle="Request an on-site inspection"
            pending="Sending…"
            formAction={requestInspectionAction}
            className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
          <span className="text-xs leading-relaxed text-slate-500">
            Sends the customer a message asking to visit and keeps this page as a draft. It does not submit a
            price.
          </span>
        </div>
      </div>
    </form>
  );
}

export function QuoteStatusPanel({
  quote,
  status,
}: {
  quote: ProviderQuote;
  status: { label: string; tone: 'teal' | 'amber' | 'slate'; note: string };
}) {
  const badge =
    status.tone === 'teal' ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1 font-sans text-[11px] font-bold tracking-wider text-primary uppercase">
        <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
        {status.label}
      </span>
    ) : status.tone === 'amber' ? (
      <span className={BADGE_AMBER}>{status.label}</span>
    ) : (
      <span className={BADGE_SLATE}>{status.label}</span>
    );

  return (
    <section className={`${CARD} p-5`} aria-labelledby="quote-status-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="quote-status-heading" className="text-sm font-bold tracking-tight text-slate-900">
            {quote.version} · {formatMoney(quote.totalMinor, quote.currencyCode)}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {quote.submittedAt
              ? `Submitted ${new Date(quote.submittedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
              : 'Submission date not recorded'}
            {quote.validUntil
              ? ` · valid until ${new Date(quote.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : ' · no validity date set'}
          </p>
        </div>
        {badge}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-600">{status.note}</p>
      {quote.lockedAt ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-solid border-primary-subtle bg-primary-surface p-3.5 text-xs leading-relaxed text-slate-600">
          <Lock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            Locked on {new Date(quote.lockedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            . The database refuses any further change to this version, which is what makes the agreement and the
            payment behind it mean something.
          </span>
        </p>
      ) : null}
    </section>
  );
}

export function QuoteBreakdownPanel({ quote }: { quote: ProviderQuote }) {
  return (
    <section className={`${CARD} p-5`} aria-labelledby="quote-breakdown-heading">
      <h2 id="quote-breakdown-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <ReceiptText aria-hidden="true" className="h-4 w-4 text-primary" />
        What the customer is being charged
      </h2>

      {quote.lineItems.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          This version has no itemisation — it carries a single total. Versions written before the itemisation
          existed look like this, and the customer sees the same thing you do.
        </p>
      ) : (
        <dl className="mt-3 grid gap-2">
          {quote.lineItems.map(item => (
            <div key={`${item.label}:${item.amountMinor}`} className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-200 pb-1.5 text-sm">
              <dt className="text-slate-700">{item.label}</dt>
              <dd className="font-sans text-slate-800">{formatMoney(item.amountMinor, quote.currencyCode)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-200 pb-1.5 text-sm">
            <dt className="text-slate-700">Taxes and fees</dt>
            <dd className="font-sans text-slate-800">{formatMoney(quote.taxesMinor, quote.currencyCode)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 pt-1 text-sm font-bold">
            <dt className="text-slate-900">Total</dt>
            <dd className="font-sans text-slate-900">{formatMoney(quote.totalMinor, quote.currencyCode)}</dd>
          </div>
        </dl>
      )}

      {quote.addons.length > 0 ? (
        <div className="mt-4 rounded-xl border border-solid border-slate-200 p-3.5">
          <p className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Optional add-ons — not in the total
          </p>
          <ul className="mt-2 grid gap-1 text-xs text-slate-600">
            {quote.addons.map(addon => (
              <li key={`${addon.label}:${addon.amountMinor}`} className="flex justify-between gap-3">
                <span>{addon.label}</span>
                <span className="font-sans">{formatMoney(addon.amountMinor, quote.currencyCode)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Materials</dt>
          <dd className="mt-0.5 text-slate-700">
            {quote.materialsIncluded === true
              ? 'Included in the price'
              : quote.materialsIncluded === false
                ? 'Charged on top'
                : 'Not stated'}
            {quote.materialsNote ? ` — ${quote.materialsNote}` : ''}
          </dd>
        </div>
        <div>
          <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Not covered</dt>
          <dd className="mt-0.5 text-slate-700">{quote.exclusions ?? 'Nothing stated as excluded'}</dd>
        </div>
        <div>
          <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Timeline</dt>
          <dd className="mt-0.5 text-slate-700">
            {quote.timelineDays ? `${quote.timelineDays} working day${quote.timelineDays === 1 ? '' : 's'}` : 'Not stated'}
            {quote.timelineNote ? ` — ${quote.timelineNote}` : ''}
          </dd>
        </div>
        <div>
          <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Warranty</dt>
          <dd className="mt-0.5 text-slate-700">{quote.warrantyTerms ?? 'None stated'}</dd>
        </div>
      </dl>
    </section>
  );
}

export function QuoteVersionHistory({ versions, currentId }: { versions: ProviderQuote[]; currentId: string }) {
  if (versions.length <= 1) {
    return (
      <p className="text-xs leading-relaxed text-slate-500">
        This is your only version on this request. A re-price would appear above it, and this one would stay
        readable exactly as the customer first saw it.
      </p>
    );
  }

  return (
    <section className={`${CARD} p-5`} aria-labelledby="version-history-heading">
      <h2 id="version-history-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <History aria-hidden="true" className="h-4 w-4 text-primary" />
        Versions
      </h2>
      <ol className="mt-3 grid gap-2">
        {versions.map(version => (
          <li
            key={version.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid p-3 ${
              version.id === currentId ? 'border-primary-subtle bg-primary-surface' : 'border-slate-200'
            }`}
          >
            <span className="text-xs text-slate-700">
              <strong className="font-semibold">{version.version}</strong> ·{' '}
              {formatMoney(version.totalMinor, version.currencyCode)} · {version.status.replaceAll('_', ' ')}
              {version.submittedAt
                ? ` · ${new Date(version.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                : ''}
            </span>
            {version.id === currentId ? (
              <span className={BADGE_SLATE}>You are reading this</span>
            ) : (
              <Link href={`${PROVIDER_PATHS.quotes}/${version.id}`} className={LINK_ARROW}>
                Open {version.version}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The diff against the previous version.
 *
 * ⚠️ IT IS COMPUTED FROM TWO ROWS, NOT RECONSTRUCTED FROM A SUMMARY. The brief asks that a revision never
 * silently overwrite the baseline, and the strongest version of that promise is a page that can show what
 * changed — including when the change is a line that disappeared.
 */
export function QuoteVersionDiffPanel({ diff }: { diff: QuoteDiff }) {
  const nothingChanged = diff.lineDiffs.length === 0 && diff.fields.length === 0 && diff.deltaMinor === 0;

  return (
    <section className={`${CARD} p-5`} aria-labelledby="version-diff-heading">
      <h2 id="version-diff-heading" className="text-sm font-bold tracking-tight text-slate-900">
        What changed from {diff.previousVersion} to {diff.nextVersion}
      </h2>

      {nothingChanged ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          Nothing in the figures or the terms differs between these two versions. If you meant to change
          something, it did not reach the quote.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-slate-700">
            Total went from{' '}
            <strong className="font-semibold">{formatMoney(diff.previousTotalMinor, diff.previousCurrency)}</strong> to{' '}
            <strong className="font-semibold">{formatMoney(diff.nextTotalMinor, diff.nextCurrency)}</strong>
            {diff.deltaMinor !== 0 ? (
              <span className={diff.deltaMinor > 0 ? 'text-amber-800' : 'text-primary'}>
                {' '}
                ({diff.deltaMinor > 0 ? '+' : '−'}
                {formatMoney(Math.abs(diff.deltaMinor), diff.nextCurrency)})
              </span>
            ) : null}
            .
          </p>
          {!diff.currenciesMatch ? (
            <p className="mt-2 rounded-xl border border-solid border-secondary bg-secondary-light p-3 text-xs leading-relaxed text-amber-900">
              These two versions are in different currencies ({diff.previousCurrency} and {diff.nextCurrency}), so
              the difference between their totals is not a price movement — it is two different units of money.
              Read each version on its own terms.
            </p>
          ) : null}

          {diff.lineDiffs.length > 0 ? (
            <table className="mt-3 w-full text-xs">
              <caption className="sr-only">Line items that differ between the two versions</caption>
              <thead>
                <tr className="text-left font-sans text-[11px] tracking-wider text-slate-500 uppercase">
                  <th scope="col" className="pb-1">
                    Line
                  </th>
                  <th scope="col" className="pb-1">
                    {diff.previousVersion}
                  </th>
                  <th scope="col" className="pb-1">
                    {diff.nextVersion}
                  </th>
                </tr>
              </thead>
              <tbody>
                {diff.lineDiffs.map(line => (
                  <tr key={line.label} className="border-t border-dashed border-slate-200">
                    <th scope="row" className="py-1.5 text-left font-normal text-slate-700">
                      {line.label}
                    </th>
                    <td className="py-1.5 font-sans text-slate-600">
                      {line.previousMinor === null ? 'not quoted' : formatMoney(line.previousMinor, diff.previousCurrency)}
                    </td>
                    <td className="py-1.5 font-sans text-slate-800">
                      {line.nextMinor === null ? 'removed' : formatMoney(line.nextMinor, diff.nextCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {diff.fields.length > 0 ? (
            <dl className="mt-4 grid gap-3">
              {diff.fields.map(field => (
                <div key={field.key} className="rounded-xl border border-solid border-slate-200 p-3.5">
                  <dt className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">{field.label}</dt>
                  <dd className="mt-1 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                    <span>
                      <span className="font-semibold text-slate-700">{diff.previousVersion}: </span>
                      {field.previous}
                    </span>
                    <span>
                      <span className="font-semibold text-slate-700">{diff.nextVersion}: </span>
                      {field.next}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * What the customer said, and the two channels it comes through.
 *
 * `quote_change_requests` is the customer asking for a change or an explanation; the messages below are the
 * provider's own replies. Both are shown here because a question with no visible answer is how a price
 * conversation stalls.
 */
export function QuoteCustomerPanel({
  changes,
  messages,
  providerId,
  requestId,
  quoteId,
  nextPath,
}: {
  changes: QuoteChangeRequest[];
  /**
   * Only what this panel renders. The provider's own messages need no author line — the panel labels them
   * "You" — so requiring the customer-facing name here would make the caller fetch a column it never shows.
   */
  messages: { id: string; message: string; createdAt: string | null }[];
  providerId: string;
  requestId: string;
  quoteId: string;
  nextPath: string;
}) {
  return (
    <section className={`${CARD} p-5`} aria-labelledby="customer-responses-heading">
      <h2 id="customer-responses-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <MessageSquare aria-hidden="true" className="h-4 w-4 text-primary" />
        The conversation
      </h2>

      <div className="mt-3 grid gap-3">
        {changes.length === 0 ? (
          <p className="text-xs leading-relaxed text-slate-600">
            The customer has not asked for a change or an explanation on this version.
          </p>
        ) : (
          changes.map(change => (
            <article key={change.id} className="rounded-xl border border-solid border-slate-200 p-3.5">
              <p className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                Customer · {change.kind.replaceAll('_', ' ')} · {change.status}
              </p>
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-slate-700">{change.message}</p>
              <p className="mt-1 text-xs text-slate-400">
                {change.createdAt ? new Date(change.createdAt).toLocaleString('en-GB') : 'Date not recorded'}
              </p>
            </article>
          ))
        )}

        {messages.map(message => (
          <article key={message.id} className="rounded-xl border border-solid border-primary-subtle bg-primary-surface p-3.5">
            <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">You</p>
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-slate-700">{message.message}</p>
            <p className="mt-1 text-xs text-slate-400">
              {message.createdAt ? new Date(message.createdAt).toLocaleString('en-GB') : 'Date not recorded'}
            </p>
          </article>
        ))}
      </div>

      <form action={sendQuoteMessageAction} className="mt-4 grid gap-2 border-t border-solid border-slate-200 pt-4">
        <input type="hidden" name="provider_id" value={providerId} />
        <input type="hidden" name="request_id" value={requestId} />
        <input type="hidden" name="quote_id" value={quoteId} />
        <input type="hidden" name="next" value={nextPath} />
        <label htmlFor="quote_message" className={LABEL}>
          Message the customer about this quote
        </label>
        <textarea
          id="quote_message"
          name="message"
          rows={3}
          required
          minLength={2}
          maxLength={2000}
          placeholder="e.g. The second version drops the scaffold because the customer is providing it."
          className={FIELD}
        />
        <div>
          <PendingButton
            idle="Send message"
            pending="Sending…"
            className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </form>
    </section>
  );
}

/**
 * Withdraw, or say why you cannot.
 *
 * ⚠️ THE BUTTON DISAPPEARS ON AN ACCEPTED VERSION AND THE REASON IS GIVEN. `withdraw_quote_command` refuses it
 * in SQL as well, so the page is not the control — it is the explanation, offered before somebody presses a
 * button that would fail.
 */
export function QuoteActionsPanel({ quote, nextPath }: { quote: ProviderQuote; nextPath: string }) {
  const locked = Boolean(quote.lockedAt) || quote.status === 'accepted';
  const alreadyWithdrawn = quote.status === 'withdrawn';

  return (
    <section className={`${CARD} p-5`} aria-labelledby="quote-actions-heading">
      <h2 id="quote-actions-heading" className="text-sm font-bold tracking-tight text-slate-900">
        What you can do with this version
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href={`${PROVIDER_PATHS.quotesNew}?request=${quote.requestId}&from=${quote.id}`}
          className="inline-flex items-center gap-2 rounded-lg bg-secondary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white no-underline shadow-sm transition-colors hover:bg-secondary-dark"
        >
          Submit revised quote
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>

        {locked ? (
          <p className="text-xs leading-relaxed text-slate-500">
            This version cannot be withdrawn or changed: the customer accepted it.
          </p>
        ) : alreadyWithdrawn ? (
          <p className="text-xs leading-relaxed text-slate-500">
            This version is already withdrawn. A revised quote is a new version beside it.
          </p>
        ) : (
          <form action={withdrawQuoteAction}>
            <input type="hidden" name="quote_id" value={quote.id} />
            <input type="hidden" name="next" value={nextPath} />
            <ConfirmSubmit
              label="Withdraw quote"
              triggerClassName="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
              icon="danger"
              title="Withdraw this quote?"
              description="The customer can no longer accept it. It stays visible in the history so they can see what was offered, and a revised quote is a new version beside it rather than a replacement."
              confirmLabel="Withdraw it"
            />
          </form>
        )}
      </div>

      {quote.status === 'submitted' && !locked ? (
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <FileWarning aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            Withdrawing does not delete anything and does not notify the customer automatically — send them a
            message if the change matters to them.
          </span>
        </p>
      ) : null}
    </section>
  );
}

/**
 * The signed agreement, when there is one.
 *
 * ⚠️ THE PROVIDER SEES THE RECORD, NOT THE CUSTOMER'S PAGE. The agreement document is built from the
 * customer's view of their own request and their acceptance flow; what the provider is entitled to — and what
 * the policy on `agreement_acceptances` gives them — is the record: which version, what total, when, and by
 * which authentication method. The full text the customer read is their copy of the terms the provider
 * themselves wrote plus the platform's own fee policy, which the provider can read on the quote above.
 */
export function QuoteAgreementPanel({
  agreement,
  assignmentId,
}: {
  agreement: {
    quoteVersion: string;
    totalMinor: number;
    currencyCode: string;
    authMethod: string;
    acceptedAt: string | null;
    verifiedAt: string | null;
    agreementHash: string;
    consentVersion: string;
  } | null;
  assignmentId: string | null;
}) {
  if (!agreement) {
    return (
      <p className="text-xs leading-relaxed text-slate-500">
        No agreement has been signed for this request. One is recorded when the customer accepts a version and
        verifies by email.
      </p>
    );
  }

  return (
    <section className={`${CARD} p-5`} aria-labelledby="agreement-heading">
      <h2 id="agreement-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <CircleCheck aria-hidden="true" className="h-4 w-4 text-primary" />
        Signed agreement
      </h2>
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Version accepted</dt>
          <dd className="mt-0.5 text-slate-700">{agreement.quoteVersion}</dd>
        </div>
        <div>
          <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Total</dt>
          <dd className="mt-0.5 text-slate-700">{formatMoney(agreement.totalMinor, agreement.currencyCode)}</dd>
        </div>
        <div>
          <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Accepted</dt>
          <dd className="mt-0.5 text-slate-700">
            {agreement.acceptedAt ? new Date(agreement.acceptedAt).toLocaleString('en-GB') : 'Date not recorded'}
          </dd>
        </div>
        <div>
          <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">How they verified</dt>
          <dd className="mt-0.5 text-slate-700">
            {agreement.authMethod} {agreement.verifiedAt ? `· ${new Date(agreement.verifiedAt).toLocaleString('en-GB')}` : ''}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Fingerprint</dt>
          <dd className="mt-0.5 font-sans break-all text-slate-600">
            {agreement.agreementHash.slice(0, 32)}… ({agreement.consentVersion})
          </dd>
        </div>
      </dl>
      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          The fingerprint is taken from the terms as the customer saw them. If the agreement page has changed
          since, a different fingerprint is produced — which is how a changed document is told apart from the one
          that was signed.
        </span>
      </p>
      {assignmentId ? (
        <p className="mt-3">
          <Link href={`${PROVIDER_PATHS.work}/${assignmentId}`} className={LINK_ARROW}>
            Open the job
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </p>
      ) : null}
    </section>
  );
}

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  History,
  Info,
  Plus,
  ShieldCheck,
  Wrench,
} from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import {
  createAssetAction,
  fileWarrantyClaimAction,
  recordServiceEventAction,
  updateAssetAction,
  withdrawWarrantyClaimAction,
} from '@/features/customer/asset-actions';
import {
  ASSET_CATEGORY_SUGGESTIONS,
  ASSET_EVENT_KINDS,
  ASSET_EVENT_KIND_LABEL,
  ASSET_FAILURE_COPY,
  WARRANTY_COPY,
  assetFailureCode,
  formatDate,
  isMaintenanceDue,
  warrantyState,
  type AssetDetailRow,
  type CustomerAsset,
} from '@/features/customer/assets';

/**
 * The asset registry and one asset's aftercare page.
 *
 * ⚠️ THE PLATFORM DOES NOT ENFORCE WARRANTIES AND NONE OF THIS PRETENDS IT DOES. `warranty_expires_on` is what
 * the customer recorded, the badge is derived from that date on every read, and filing a claim records the
 * claim against the asset and shows it to the provider they named. There is no adjudication and no status
 * beyond the two a customer can cause.
 *
 * ⚠️ DOCUMENTS ARE LINKS. There is no object storage in this project — `work_evidence.storage_object_path` is a
 * column every writer passes null to — so the page asks for links and says so, rather than offering a dropzone
 * that would collect bytes with nowhere to put them.
 */

const TEAL =
  'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-sans text-[11px] font-bold tracking-wider text-primary uppercase';

export function AssetNotice({
  failed,
  saved,
  logged,
  claimed,
}: {
  failed?: string;
  saved?: string;
  logged?: string;
  claimed?: string;
}) {
  const code = assetFailureCode(failed);

  return (
    <div className="mb-6 space-y-3">
      {code ? (
        <p
          role="alert"
          className="rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900"
        >
          {ASSET_FAILURE_COPY[code]}
        </p>
      ) : null}
      {!code && saved ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          Saved. The asset record is updated.
        </p>
      ) : null}
      {!code && logged ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          Added to the history.
        </p>
      ) : null}
      {!code && claimed ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          {claimed === 'withdrawn'
            ? 'Claim withdrawn.'
            : 'Claim recorded against this asset. The provider named on it can see it; the platform does not decide warranty claims.'}
        </p>
      ) : null}
    </div>
  );
}

export function WarrantyBadge({ asset }: { asset: Pick<CustomerAsset, 'warrantyExpiresOn'> }) {
  const state = warrantyState(asset);
  const copy = WARRANTY_COPY[state];
  return (
    <span className={copy.tone === 'teal' ? TEAL : copy.tone === 'amber' ? BADGE_AMBER : BADGE_SLATE}>
      <ShieldCheck aria-hidden="true" className="h-3 w-3" />
      {copy.label}
    </span>
  );
}

/**
 * The add form.
 *
 * ⚠️ THE PROVIDER IS NOT A FIELD. If the asset came out of a job on this platform the customer picks the job,
 * and the command reads the provider from the assignment — so an asset cannot name any provider on the platform
 * by passing an id. When there is no job behind it, there is no provider, and the card says so.
 */
export function AddAssetForm({
  locations,
  completedJobs,
}: {
  locations: { id: string; name: string }[];
  completedJobs: { assignmentId: string; label: string; providerName: string }[];
}) {
  return (
    <details className={`${CARD} p-4`}>
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
        <Plus aria-hidden="true" className="h-4 w-4" />
        Add an asset
      </summary>

      <form action={createAssetAction} className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="asset-name">
              What is it?
            </label>
            <input
              id="asset-name"
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={200}
              className={FIELD}
              placeholder="e.g. Living room split unit"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="asset-category">
              Kind of thing
            </label>
            <input
              id="asset-category"
              name="category"
              type="text"
              required
              minLength={2}
              maxLength={80}
              list="asset-categories"
              className={FIELD}
              placeholder="e.g. Air conditioning"
            />
            <datalist id="asset-categories">
              {ASSET_CATEGORY_SUGGESTIONS.map(suggestion => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="asset-make-model">
              Make and model <span className="font-normal normal-case">(optional)</span>
            </label>
            <input id="asset-make-model" name="make_model" type="text" maxLength={200} className={FIELD} />
          </div>
          <div>
            <label className={LABEL} htmlFor="asset-serial">
              Serial number <span className="font-normal normal-case">(optional)</span>
            </label>
            <input id="asset-serial" name="serial_number" type="text" maxLength={120} className={FIELD} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="asset-installed">
              Installed on <span className="font-normal normal-case">(optional)</span>
            </label>
            <input id="asset-installed" name="installed_on" type="date" className={FIELD} />
          </div>
          <div>
            <label className={LABEL} htmlFor="asset-location">
              Where it is <span className="font-normal normal-case">(optional)</span>
            </label>
            <select id="asset-location" name="location_id" className={FIELD} defaultValue="">
              <option value="">Not recorded</option>
              {locations.map(location => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {completedJobs.length > 0 ? (
          <div>
            <label className={LABEL} htmlFor="asset-job">
              Was it done through a job here? <span className="font-normal normal-case">(optional)</span>
            </label>
            <select id="asset-job" name="source_assignment_id" className={FIELD} defaultValue="">
              <option value="">No — somebody else installed or made it</option>
              {completedJobs.map(job => (
                <option key={job.assignmentId} value={job.assignmentId}>
                  {job.label} — {job.providerName}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              Picking a job records the provider who did it and uses the date the job finished, so the history
              starts from a fact rather than from something typed.
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={LABEL} htmlFor="asset-warranty-provider">
              Warranty held by <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              id="asset-warranty-provider"
              name="warranty_provider_name"
              type="text"
              maxLength={200}
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="asset-warranty-until">
              Warranty ends <span className="font-normal normal-case">(optional)</span>
            </label>
            <input id="asset-warranty-until" name="warranty_expires_on" type="date" className={FIELD} />
          </div>
          <div>
            <label className={LABEL} htmlFor="asset-next-service">
              Next service due <span className="font-normal normal-case">(optional)</span>
            </label>
            <input id="asset-next-service" name="next_service_due_on" type="date" className={FIELD} />
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="asset-notes">
            Notes <span className="font-normal normal-case">(optional)</span>
          </label>
          <textarea id="asset-notes" name="notes" rows={3} maxLength={2000} className={FIELD} />
        </div>

        <fieldset>
          <legend className={LABEL}>Document links</legend>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            The platform stores links, not files. Paste links to the warranty certificate or the manual (they must
            start with https://).
          </p>
          <div className="space-y-2">
            {[0, 1, 2].map(index => (
              <input
                key={index}
                name="document_url"
                type="url"
                inputMode="url"
                placeholder="https://"
                aria-label={`Document link ${index + 1}`}
                className={FIELD}
              />
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          Register this asset
        </button>
      </form>
    </details>
  );
}

export function AssetCard({ asset }: { asset: CustomerAsset }) {
  const due = isMaintenanceDue(asset);
  return (
    <li className={`${CARD} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/customer/assets/${asset.assetId}`}
            className="text-sm font-bold text-slate-900 no-underline hover:text-primary"
          >
            {asset.name}
          </Link>
          <p className="mt-0.5 text-xs text-slate-500">
            {asset.category}
            {asset.makeModel ? ` · ${asset.makeModel}` : ''}
            {asset.serialNumber ? ` · serial ${asset.serialNumber}` : ''}
          </p>
        </div>
        <WarrantyBadge asset={asset} />
      </div>

      <dl className="mt-3 grid gap-3 border-t border-solid border-slate-200 pt-3 sm:grid-cols-2">
        <div>
          <dt className={LABEL}>Installed</dt>
          <dd className="text-sm text-slate-800">{formatDate(asset.installedOn)}</dd>
        </div>
        <div>
          <dt className={LABEL}>Serviced by</dt>
          <dd className="text-sm text-slate-800">
            {asset.installedByName ?? 'Nobody recorded'}
            {asset.installedBySlug ? (
              <Link href={`/providers/${asset.installedBySlug}`} className={`${LINK_ARROW} mt-0.5 block`}>
                Provider profile
              </Link>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className={LABEL}>History</dt>
          <dd className="text-sm text-slate-800">
            {asset.serviceEventCount} entr{asset.serviceEventCount === 1 ? 'y' : 'ies'}
            {asset.lastServiceOn ? (
              <span className="mt-0.5 block text-xs text-slate-500">last {formatDate(asset.lastServiceOn)}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className={LABEL}>Warranty</dt>
          <dd className="text-sm text-slate-800">
            {asset.warrantyExpiresOn ? (
              <>
                until {formatDate(asset.warrantyExpiresOn)}
                {asset.warrantyProviderName ? (
                  <span className="mt-0.5 block text-xs text-slate-500">held by {asset.warrantyProviderName}</span>
                ) : null}
              </>
            ) : (
              <span className="text-slate-500">Not recorded</span>
            )}
          </dd>
        </div>
      </dl>

      {due ? (
        <p className="mt-3 rounded-lg border border-solid border-amber-300 bg-secondary-light px-3 py-2 text-xs font-semibold text-amber-900">
          A service was due on {formatDate(asset.nextServiceDueOn)}.
        </p>
      ) : null}

      {asset.openClaimCount > 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {asset.openClaimCount} open warranty claim{asset.openClaimCount === 1 ? '' : 's'} on this asset.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-solid border-slate-200 pt-3">
        <Link href={`/customer/assets/${asset.assetId}`} className={LINK_ARROW}>
          Open the record <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
        <Link href="/customer/requests/new" className={LINK_ARROW}>
          <Wrench aria-hidden="true" className="h-3.5 w-3.5" />
          Request maintenance
        </Link>
      </div>
    </li>
  );
}

export function AssetsEmpty() {
  return (
    <div className="rounded-2xl border border-dashed border-solid border-slate-300 bg-white px-6 py-12 text-center">
      <Wrench aria-hidden="true" className="mx-auto h-8 w-8 text-slate-300" />
      <h2 className="mt-3 text-base font-bold text-slate-900">Nothing registered yet</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-600">
        Register the things you own — the air conditioning, the generator, the plumbing — and you get one place
        with their model numbers, who fitted them, what is under warranty and when they were last serviced. It is
        your record: the platform does not write to it on your behalf, and nothing here is required to use the
        rest of the site.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// One asset
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function AssetTimeline({ detail }: { detail: AssetDetailRow }) {
  if (detail.events.length === 0) {
    return (
      <section className={`${CARD} p-5`}>
        <h2 className="flex items-center gap-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          <History aria-hidden="true" className="h-4 w-4 text-slate-400" />
          History
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Nothing recorded yet. Add what has happened to it — a service, a repair, a note — and this becomes the
          record you can hand to whoever works on it next.
        </p>
      </section>
    );
  }

  return (
    <section className={`${CARD} p-5`}>
      <h2 className="flex items-center gap-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        <History aria-hidden="true" className="h-4 w-4 text-slate-400" />
        History
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
        Ordered by when each thing happened, not by when it was written down.
      </p>
      <ol className="mt-4 space-y-4">
        {detail.events.map(event => (
          <li key={event.id} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-solid text-[10px] font-bold ${
                event.kind === 'warranty_claim'
                  ? 'border-amber-500 bg-secondary-light text-amber-800'
                  : 'border-transparent bg-primary text-white'
              }`}
            >
              {event.kind === 'warranty_claim' ? '!' : '✓'}
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold text-slate-900">
                  {ASSET_EVENT_KIND_LABEL[event.kind] ?? event.kind}
                </span>
                <span className="font-sans text-[11px] text-slate-500">{formatDate(event.occurredOn)}</span>
              </p>
              <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{event.summary}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {event.providerName ? `By ${event.providerName}` : 'Recorded by you'}
                {event.recordedAt
                  ? ` · written down ${new Date(event.recordedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : ''}
              </p>
              {event.documentUrls.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {event.documentUrls.map(url => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noreferrer noopener nofollow" className={LINK_ARROW}>
                        <ExternalLink aria-hidden="true" className="h-3 w-3" />
                        Document
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AssetDetailsForm({
  detail,
  locations,
}: {
  detail: AssetDetailRow;
  locations: { id: string; name: string }[];
}) {
  return (
    <details className={`${CARD} p-5`}>
      <summary className="cursor-pointer font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        Edit the details
      </summary>
      <form action={updateAssetAction} className="mt-4 space-y-4">
        <input type="hidden" name="asset_id" value={detail.assetId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="edit-make-model">
              Make and model
            </label>
            <input
              id="edit-make-model"
              name="make_model"
              type="text"
              maxLength={200}
              defaultValue={detail.makeModel ?? ''}
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="edit-serial">
              Serial number
            </label>
            <input
              id="edit-serial"
              name="serial_number"
              type="text"
              maxLength={120}
              defaultValue={detail.serialNumber ?? ''}
              className={FIELD}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={LABEL} htmlFor="edit-warranty-provider">
              Warranty held by
            </label>
            <input
              id="edit-warranty-provider"
              name="warranty_provider_name"
              type="text"
              maxLength={200}
              defaultValue={detail.warrantyProviderName ?? ''}
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="edit-warranty-until">
              Warranty ends
            </label>
            <input
              id="edit-warranty-until"
              name="warranty_expires_on"
              type="date"
              defaultValue={detail.warrantyExpiresOn ?? ''}
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="edit-next-service">
              Next service due
            </label>
            <input
              id="edit-next-service"
              name="next_service_due_on"
              type="date"
              defaultValue={detail.nextServiceDueOn ?? ''}
              className={FIELD}
            />
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="edit-notes">
            Notes
          </label>
          <textarea
            id="edit-notes"
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={detail.notes ?? ''}
            className={FIELD}
          />
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          The area{locations.length > 0 ? ` (${locations.length} available)` : ''} is set when you register the
          asset and is not editable here. Either way the platform keeps no street address for it, and a provider
          decides coverage from the area on the request.
        </p>

        <fieldset>
          <legend className={LABEL}>Replace the document links</legend>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            Leave these blank to keep the links already on the asset
            {detail.documentUrls.length > 0 ? ` (${detail.documentUrls.length} saved)` : ''}. Filling any of them
            replaces the whole set.
          </p>
          <div className="space-y-2">
            {[0, 1, 2].map(index => (
              <input
                key={index}
                name="document_url"
                type="url"
                inputMode="url"
                placeholder="https://"
                aria-label={`Document link ${index + 1}`}
                className={FIELD}
              />
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
        >
          Save the details
        </button>
      </form>
    </details>
  );
}

export function LogServiceEventForm({ detail }: { detail: AssetDetailRow }) {
  return (
    <details className={`${CARD} p-5`}>
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
        <Wrench aria-hidden="true" className="h-4 w-4" />
        Add to the history
      </summary>
      <form action={recordServiceEventAction} className="mt-4 space-y-4">
        <input type="hidden" name="asset_id" value={detail.assetId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="event-date">
              When it happened
            </label>
            <input
              id="event-date"
              name="occurred_on"
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="event-kind">
              What kind of thing
            </label>
            <select id="event-kind" name="kind" className={FIELD} defaultValue="service">
              {ASSET_EVENT_KINDS.map(kind => (
                <option key={kind.key} value={kind.key}>
                  {kind.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="event-summary">
            What happened
          </label>
          <textarea
            id="event-summary"
            name="summary"
            rows={3}
            required
            minLength={2}
            maxLength={2000}
            className={FIELD}
            placeholder="e.g. Serviced, gas topped up, filter cleaned."
          />
        </div>

        <fieldset>
          <legend className={LABEL}>Document links</legend>
          <div className="space-y-2">
            {[0, 1].map(index => (
              <input
                key={index}
                name="document_url"
                type="url"
                inputMode="url"
                placeholder="https://"
                aria-label={`History document link ${index + 1}`}
                className={FIELD}
              />
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          Add to history
        </button>
      </form>
    </details>
  );
}

export function WarrantyClaimPanel({ detail }: { detail: AssetDetailRow }) {
  const openClaim = detail.claims.find(claim => claim.status === 'open');

  return (
    <section className={`${CARD} p-5`}>
      <h2 className="flex items-center gap-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        <ShieldCheck aria-hidden="true" className="h-4 w-4 text-slate-400" />
        Warranty claims
      </h2>

      <p className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
        <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          The platform does not decide warranty claims and holds no warranty of its own. What this does is record
          that you are claiming, with your reason, where the provider named on the asset can see it — the warranty
          is between you and them.
        </span>
      </p>

      {detail.claims.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {detail.claims.map(claim => (
            <li key={claim.id} className="rounded-xl border border-solid border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">
                  {claim.status === 'open' ? 'Claim open' : 'Claim withdrawn'}
                </span>
                <span className={claim.status === 'open' ? BADGE_AMBER : BADGE_SLATE}>
                  {claim.providerName ? `with ${claim.providerName}` : 'no provider named'}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-slate-600">{claim.reason}</p>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {new Date(claim.createdAt).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              {claim.documentUrls.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {claim.documentUrls.map(url => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noreferrer noopener nofollow" className={LINK_ARROW}>
                        <ExternalLink aria-hidden="true" className="h-3 w-3" />
                        Document
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {openClaim ? (
        <form action={withdrawWarrantyClaimAction} className="mt-3">
          <input type="hidden" name="asset_id" value={detail.assetId} />
          <input type="hidden" name="claim_id" value={openClaim.id} />
          <button type="submit" className="text-xs font-semibold text-slate-500 underline hover:text-primary">
            Withdraw the open claim
          </button>
        </form>
      ) : (
        <details className="mt-3">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-amber-600" />
            File a warranty claim
          </summary>
          <form action={fileWarrantyClaimAction} className="mt-3 space-y-3">
            <input type="hidden" name="asset_id" value={detail.assetId} />
            <div>
              <label className={LABEL} htmlFor="claim-reason">
                What has gone wrong?
              </label>
              <textarea
                id="claim-reason"
                name="reason"
                rows={4}
                required
                minLength={10}
                maxLength={2000}
                className={FIELD}
                placeholder="e.g. The compressor has stopped cooling and it is eleven months old."
              />
            </div>
            <fieldset>
              <legend className={LABEL}>Document links</legend>
              <div className="space-y-2">
                {[0, 1].map(index => (
                  <input
                    key={index}
                    name="document_url"
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    aria-label={`Claim document link ${index + 1}`}
                    className={FIELD}
                  />
                ))}
              </div>
            </fieldset>
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
            >
              <FileText aria-hidden="true" className="h-3.5 w-3.5" />
              Record the claim
            </button>
          </form>
        </details>
      )}
    </section>
  );
}

/**
 * Aftercare: the four actions, told as what they actually are.
 *
 * ⚠️ THERE IS NO DIRECT HIRE ON THIS PLATFORM. Work starts with a request; providers who cover the trade and
 * the area are shown it and quote, and the customer chooses. A button that booked the same provider directly
 * would be a different product, and it would remove the comparison that is the point of the request flow. So
 * both of the top two actions start a request, and the panel says so instead of implying a booking.
 */
export function AftercareActions({ detail }: { detail: AssetDetailRow }) {
  const due = isMaintenanceDue(detail);

  return (
    <section className={`${CARD} p-5`}>
      <h2 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">Aftercare</h2>

      {due ? (
        <p className="mt-2 rounded-lg border border-solid border-amber-300 bg-secondary-light px-3 py-2 text-xs font-semibold text-amber-900">
          <CalendarClock aria-hidden="true" className="mr-1.5 inline h-3.5 w-3.5" />
          A service was due on {formatDate(detail.nextServiceDueOn)}.
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        <Link
          href="/customer/requests/new"
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-3 font-sans text-sm font-bold text-white no-underline shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95"
        >
          <Wrench aria-hidden="true" className="h-4 w-4" />
          {due ? 'Schedule maintenance' : 'Request maintenance'}
        </Link>
        <Link
          href="/customer/requests/new"
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-slate-700 no-underline uppercase transition-colors hover:border-primary hover:text-primary"
        >
          Hire {detail.installedByName ?? 'the original provider'} again
        </Link>
        <a
          href={`/customer/assets/${detail.assetId}/documents`}
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-slate-700 no-underline uppercase transition-colors hover:border-primary hover:text-primary"
        >
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
          Download documents
        </a>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        The first two start a request, because that is how work begins here: providers who cover the trade and
        your area are shown it and quote, and you choose. There is no way to book one provider directly — which is
        also what stops one provider quietly setting the price.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Downloading produces a document of this record: the details, the history and any claims. The platform
        holds no warranty certificate of its own — any certificate is at the link you saved.
      </p>
    </section>
  );
}

export function AssetSourceLink({ detail }: { detail: AssetDetailRow }) {
  if (!detail.sourceAssignmentId || !detail.sourceRequestId) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
      <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
      Installed through
      <Link href={`/customer/requests/${detail.sourceRequestId}`} className={LINK_ARROW}>
        {detail.sourceRequestLabel ?? 'a job on this platform'}
      </Link>
      {detail.installedByName ? <span>with {detail.installedByName}.</span> : null}
    </p>
  );
}

/** Said once, on both asset pages: this register is not a financial or account surface. */
export function AssetValueNote() {
  return (
    <p className="text-xs leading-relaxed text-slate-500">
      Nothing on this page affects your payments, your requests or your rating. It is a record for you — and for
      whoever works on the thing next.
    </p>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { CARD, LABEL, LINK_ARROW, PAGE_SHELL } from '@/components/discovery/tokens';
import {
  AftercareActions,
  AssetDetailsForm,
  AssetNotice,
  AssetSourceLink,
  AssetTimeline,
  AssetValueNote,
  LogServiceEventForm,
  WarrantyBadge,
  WarrantyClaimPanel,
} from '@/components/customer/AssetSections';
import { formatDate, getCustomerAsset, isMaintenanceDue } from '@/features/customer/assets';
import { getLocationOptions } from '@/features/customer/requests';

export const metadata = {
  title: 'Asset',
  robots: { index: false, follow: false },
};

/**
 * One asset and its aftercare — `/customer/assets/[assetId]`.
 *
 * ⚠️ THE READ ASSERTS OWNERSHIP, AND A FAILED READ IS NOT A MISSING ASSET. `get_customer_asset` returns no row
 * for an asset belonging to somebody else — the same answer as one that does not exist, so an id cannot be
 * probed — and this page separates a read failure from that so a transient error cannot tell somebody their
 * record has vanished.
 */
export default async function CustomerAssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<{ failed?: string; saved?: string; logged?: string; claimed?: string }>;
}) {
  const { assetId } = await params;
  const query = await searchParams;

  const [{ detail, unavailable }, locations] = await Promise.all([
    getCustomerAsset(assetId),
    getLocationOptions(),
  ]);

  if (unavailable) {
    return (
      <section className={PAGE_SHELL}>
        <div
          role="alert"
          className="rounded-2xl border border-solid border-amber-300 bg-secondary-light px-6 py-8 text-center"
        >
          <p className="text-sm font-semibold text-amber-900">This asset could not be read just now.</p>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-amber-900/90">
            Nothing has changed about the record — this is a read failure, not a missing asset. Reload in a moment.
          </p>
          <Link href="/customer/assets" className={`${LINK_ARROW} mt-4`}>
            Back to your assets
          </Link>
        </div>
      </section>
    );
  }
  if (!detail) notFound();

  const due = isMaintenanceDue(detail);

  return (
    <section className={PAGE_SHELL}>
      <AssetNotice failed={query.failed} saved={query.saved} logged={query.logged} claimed={query.claimed} />

      <nav aria-label="Asset" className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Link href="/customer/assets" className={LINK_ARROW}>
          ← All assets
        </Link>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className={`${CARD} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">{detail.name}</h1>
                <p className="mt-1 text-sm text-slate-600">
                  {detail.category}
                  {detail.makeModel ? ` · ${detail.makeModel}` : ''}
                </p>
              </div>
              <WarrantyBadge asset={detail} />
            </div>

            <dl className="mt-5 grid gap-4 border-t border-solid border-slate-200 pt-5 sm:grid-cols-2">
              <div>
                <dt className={LABEL}>Serial number</dt>
                <dd className="font-mono text-sm break-all text-slate-800">
                  {detail.serialNumber ?? 'Not recorded'}
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Installed</dt>
                <dd className="text-sm text-slate-800">
                  {formatDate(detail.installedOn)}
                  {detail.locationName ? (
                    <span className="mt-0.5 block text-xs text-slate-500">{detail.locationName}</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Serviced by</dt>
                <dd className="text-sm text-slate-800">
                  {detail.installedByName ?? 'Nobody recorded'}
                  {detail.installedBySlug ? (
                    <Link href={`/providers/${detail.installedBySlug}`} className={`${LINK_ARROW} mt-0.5 block`}>
                      Provider profile
                    </Link>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Warranty</dt>
                <dd className="text-sm text-slate-800">
                  {detail.warrantyExpiresOn ? (
                    <>
                      until {formatDate(detail.warrantyExpiresOn)}
                      {detail.warrantyProviderName ? (
                        <span className="mt-0.5 block text-xs text-slate-500">
                          held by {detail.warrantyProviderName}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-slate-500">Not recorded</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Next service</dt>
                <dd className="text-sm text-slate-800">
                  {detail.nextServiceDueOn ? (
                    <>
                      {formatDate(detail.nextServiceDueOn)}
                      {due ? <span className="mt-0.5 block text-xs font-semibold text-amber-800">overdue</span> : null}
                    </>
                  ) : (
                    <span className="text-slate-500">No date set</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className={LABEL}>History</dt>
                <dd className="text-sm text-slate-800">
                  {detail.events.length} entr{detail.events.length === 1 ? 'y' : 'ies'}
                  {detail.lastServiceOn ? (
                    <span className="mt-0.5 block text-xs text-slate-500">
                      last {formatDate(detail.lastServiceOn)}
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>

            {detail.notes ? (
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-slate-600">
                <span className="font-semibold">Your notes:</span> {detail.notes}
              </p>
            ) : null}

            <AssetSourceLink detail={detail} />

            {detail.documentUrls.length > 0 ? (
              <div className="mt-4 border-t border-solid border-slate-200 pt-4">
                <h2 className={LABEL}>Documents you saved</h2>
                <ul className="space-y-1.5">
                  {detail.documentUrls.map(url => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noreferrer noopener nofollow" className={LINK_ARROW}>
                        Open document
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  These are links to files held elsewhere. The platform stores references, not documents, so if
                  the file moves the link stops working.
                </p>
              </div>
            ) : (
              <p className="mt-4 border-t border-solid border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
                No document links saved. Warranty certificates and manuals live with whoever issued them; add a
                link above and this page will remember where they are.
              </p>
            )}
          </section>

          <AssetTimeline detail={detail} />
          <LogServiceEventForm detail={detail} />
          <WarrantyClaimPanel detail={detail} />
        </div>

        <aside className="space-y-4">
          <AftercareActions detail={detail} />
          <AssetDetailsForm detail={detail} locations={locations} />

          <section className={`${CARD} p-5`}>
            <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              About this record
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              You wrote this, and only you can change it. The dates are the dates things happened, so the history
              stays true even when it is written up later.
            </p>
            <div className="mt-3 border-t border-solid border-slate-200 pt-3">
              <AssetValueNote />
            </div>
            <Link href="/customer/assets" className={`${LINK_ARROW} mt-3`}>
              All assets <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </section>
        </aside>
      </div>
    </section>
  );
}

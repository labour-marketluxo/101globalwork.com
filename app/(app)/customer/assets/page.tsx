import { Info } from '@/components/ui/icons';
import { CARD, PAGE_SHELL } from '@/components/discovery/tokens';
import {
  AddAssetForm,
  AssetCard,
  AssetNotice,
  AssetValueNote,
  AssetsEmpty,
} from '@/components/customer/AssetSections';
import { getCustomerAssets, isMaintenanceDue } from '@/features/customer/assets';
import { getCustomerBookings } from '@/features/customer/bookings';
import { getLocationOptions } from '@/features/customer/requests';

export const metadata = {
  title: 'My assets',
  robots: { index: false, follow: false },
};

/**
 * The asset registry — `/customer/assets`.
 *
 * ⚠️ THIS IS THE CUSTOMER'S OWN RECORD, AND THE PLATFORM DOES NOT WRITE TO IT. Nothing here is derived from the
 * work the platform brokered: the customer enters what they own, and the only provider on an asset is the one
 * they pointed at (read from a completed job if there was one). A registry that required every item to have
 * come through this platform would be a registry nobody keeps, and a registry that invented facts would be
 * worse than no registry.
 *
 * ⚠️ THE REMINDER IS A DATE, NOT A NOTIFICATION. There is no scheduler and no email delivery in this project —
 * the outbox is unpublished. A "next service due" that has passed is shown here when the customer visits; the
 * page does not claim anything was sent.
 */
export default async function CustomerAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string; saved?: string; logged?: string; claimed?: string }>;
}) {
  const query = await searchParams;

  const [{ assets, unavailable }, locations, { bookings }] = await Promise.all([
    getCustomerAssets(),
    getLocationOptions(),
    getCustomerBookings(),
  ]);

  // Completed jobs are offered as the source of an asset, so the provider and the installation date come from
  // the record rather than from something typed.
  const completedJobs = bookings
    .filter(booking => booking.assignmentStatus === 'completed')
    .map(booking => ({
      assignmentId: booking.assignmentId,
      label: booking.requestLabel,
      providerName: booking.providerName,
    }));

  const dueCount = assets.filter(asset => isMaintenanceDue(asset)).length;

  return (
    <section className={PAGE_SHELL}>
      <AssetNotice failed={query.failed} saved={query.saved} logged={query.logged} claimed={query.claimed} />

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">My assets</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          The things you own that were installed, made or maintained — with their model and serial numbers, who
          did the work, what is under warranty and when they were last seen to.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          {unavailable ? (
            <p
              role="alert"
              className="rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900"
            >
              Your assets could not be read just now. This is a read failure, not an empty registry — reload in a
              moment.
            </p>
          ) : assets.length === 0 ? (
            <AssetsEmpty />
          ) : (
            <ul className="space-y-3">
              {assets.map(asset => (
                <AssetCard key={asset.assetId} asset={asset} />
              ))}
            </ul>
          )}
        </div>

        <aside className="space-y-4">
          <AddAssetForm locations={locations} completedJobs={completedJobs} />

          {dueCount > 0 ? (
            <section className={`${CARD} p-5`}>
              <h2 className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <Info aria-hidden="true" className="h-4 w-4 text-slate-400" />
                Maintenance
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {dueCount} asset{dueCount === 1 ? ' has' : 's have'} had a service date go by. The platform does
                not send reminders — there is no scheduler or delivery here — so this is where you see it, and a
                request is how you get somebody to look at it.
              </p>
            </section>
          ) : null}

          <section className={`${CARD} p-5`}>
            <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              What this page is not
            </h2>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
              <li>· It is not a warranty. The platform records what you tell it and decides no claims.</li>
              <li>
                · It is not an ownership document. Nothing here proves anything to anybody — it is your own
                reminder of what you have.
              </li>
              <li>
                · It is not shared with providers unless you name one on the asset. A provider you named can read
                that asset; the others cannot.
              </li>
            </ul>
            <div className="mt-3 border-t border-solid border-slate-200 pt-3">
              <AssetValueNote />
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

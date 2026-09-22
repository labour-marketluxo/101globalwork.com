import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { HonestGap, IntakeStepShell } from '@/components/customer/IntakeChrome';
import { CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { saveIntakeDraftAction } from '@/features/customer/actions';
import {
  CUSTOMER_PATHS,
  URGENCY_CHOICES,
  suggestService,
} from '@/features/customer/intake';
import { getLastUsedLogistics, getRequestDraft } from '@/features/customer/requests';

export const metadata = {
  title: 'Where and when',
  robots: { index: false, follow: false },
};

type Params = { draft?: string; failed?: string; saved?: string };

const PREFERRED_WINDOWS = [
  'Any time in the day',
  'Mornings',
  'Afternoons',
  'Evenings',
  'Weekends only',
  'Needs a specific appointment slot',
] as const;

/**
 * Step 3 — Logistics.
 *
 * ⚠️ NOTHING HERE IS GEOCODED, AND THE STEP DOES NOT PRETEND IT IS. There is no geocoding service wired
 * into this platform, so "approximate location" and a "geocode ambiguity warning" cannot be real
 * features — they would be a pin drawn at a coordinate nobody computed. What the step does instead is
 * the honest version of the same idea: the areas on offer ARE the service area, so choosing one is the
 * check, and an area that is not on the list is an area this platform does not cover yet. It says that
 * in as many words rather than letting somebody submit into a void.
 *
 * THE ADDRESS SHAPE IS NOT WESTERN BY ASSUMPTION. There is no postcode field and no street-number
 * field, because most of the addresses this platform serves do not have them: the picker is an area,
 * and everything else is a landmark, a sub-locality and access notes in the visitor's own words.
 *
 * The emergency choice is a real choice in the enum and NOT a dispatch. Nothing in this codebase
 * messages a provider — the confirmation page says the same thing after submission — so the warning has
 * to be here, before the request exists, where it can still change what somebody does next.
 */
export default async function IntakeLogisticsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;

  if (!params.draft) redirect(`${CUSTOMER_PATHS.newRequest}?failed=not_found`);

  const draft = await getRequestDraft(params.draft);
  if (!draft) redirect(`${CUSTOMER_PATHS.newRequest}?failed=not_found`);

  const chosenService = draft.services.find(service => service.id === draft.serviceEntityId)?.name ?? '';
  const { hazardous } = suggestService(`${draft.needText} ${chosenService}`, draft.services);

  const lastUsed = await getLastUsedLogistics(draft.id);

  const scope = draft.scope as {
    landmark?: string;
    area_text?: string;
    access_notes?: string;
    preferred_window?: string;
    preferred_date?: string;
  };

  // The draft's own answers win; the prefill is only a default for a field nobody has touched yet.
  const locationValue = draft.locationId || lastUsed?.locationId || '';
  const landmarkValue = scope.landmark ?? lastUsed?.landmark ?? '';
  const accessValue = scope.access_notes ?? lastUsed?.accessNotes ?? '';

  return (
    <IntakeStepShell
      step="logistics"
      title="Where and when"
      lede="This is what decides who can take the work and how soon. There is no postcode or street number to fill in — an area and a landmark you would give a driver are more useful than either."
      failed={params.failed}
      saved={params.saved === '1'}
    >
      <form action={saveIntakeDraftAction} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <input type="hidden" name="step" value="logistics" />
        <input type="hidden" name="draft_id" value={draft.id} />
        <input type="hidden" name="hazardous" value={hazardous ? 'true' : 'false'} />

        <div className="space-y-5">
          <fieldset className={`${CARD} m-0 min-w-0 p-5`}>
            <legend className="p-0 text-sm font-bold text-slate-900">Where is the work?</legend>

            <div className="mt-3">
              <label className={LABEL} htmlFor="location_id">
                Service area
              </label>
              <select
                id="location_id"
                name="location_id"
                defaultValue={locationValue}
                className={FIELD}
              >
                <option value="">Choose the closest area</option>
                {draft.locations.map(location => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-500">
                These are the areas this platform currently operates in. If yours is not on the list, it
                is not covered yet — and a request submitted from outside them has no provider to match
                against, which is why the list is the whole list.
              </p>
            </div>

            <div className="mt-4">
              <label className={LABEL} htmlFor="landmark">
                Nearest landmark or sub-locality
              </label>
              <input
                id="landmark"
                name="landmark"
                type="text"
                defaultValue={landmarkValue}
                placeholder="e.g. behind the Blue Mosque, off Adeola Street, after the junction"
                className={FIELD}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                A landmark is how directions are actually given and actually followed. It is also the one
                thing a map pin gets wrong in a compound or an unnamed street.
              </p>
            </div>

            <div className="mt-4">
              <label className={LABEL} htmlFor="area_text">
                Anything else about the place
              </label>
              <input
                id="area_text"
                name="area_text"
                type="text"
                defaultValue={scope.area_text ?? ''}
                placeholder="e.g. second building on the right, blue gate"
                className={FIELD}
              />
            </div>
          </fieldset>

          <fieldset className={`${CARD} m-0 min-w-0 p-5`}>
            <legend className="p-0 text-sm font-bold text-slate-900">Getting in</legend>
            <label className={`${LABEL} mt-3`} htmlFor="access_notes">
              Access notes
            </label>
            <textarea
              id="access_notes"
              name="access_notes"
              rows={3}
              defaultValue={accessValue}
              placeholder="e.g. ground-floor flat, gate code at the barrier, please call on arrival, work must stop by 6pm"
              className={FIELD}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Do not put a door or gate code here if you would not want it read by a provider you have
              not hired yet — this text is visible to every provider matched to the request.
            </p>
          </fieldset>

          <fieldset className={`${CARD} m-0 min-w-0 p-5`}>
            <legend className="p-0 text-sm font-bold text-slate-900">How soon does it need doing?</legend>

            <div className="mt-3 space-y-3">
              {URGENCY_CHOICES.map(choice => (
                <label
                  key={choice.value}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-solid border-slate-200 p-3 transition-colors hover:border-primary-subtle hover:bg-primary-surface"
                >
                  <input
                    type="radio"
                    name="urgency"
                    value={choice.value}
                    defaultChecked={draft.urgency === choice.value || (!draft.urgency && choice.value === 'soon')}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-bold text-slate-900">{choice.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                      {choice.detail}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {hazardous ? (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Gas, mains wiring and anything sparking or smoking are not jobs for a marketplace
                  queue. If it is unsafe right now, call the emergency services for your country first —
                  nothing on this page contacts anybody. Use this request for the repair that follows,
                  not for the emergency itself.
                </span>
              </p>
            ) : null}
          </fieldset>

          <fieldset className={`${CARD} m-0 min-w-0 p-5`}>
            <legend className="p-0 text-sm font-bold text-slate-900">When suits you?</legend>

            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="preferred_date">
                  Preferred date
                </label>
                <input
                  id="preferred_date"
                  name="preferred_date"
                  type="date"
                  defaultValue={scope.preferred_date ?? ''}
                  className={FIELD}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  A preference, not a booking. The date is confirmed by the provider you choose, and
                  nothing is scheduled until then.
                </p>
              </div>

              <div>
                <label className={LABEL} htmlFor="preferred_window">
                  Time of day
                </label>
                <select
                  id="preferred_window"
                  name="preferred_window"
                  defaultValue={scope.preferred_window ?? ''}
                  className={FIELD}
                >
                  <option value="">No preference</option>
                  {PREFERRED_WINDOWS.map(window => (
                    <option key={window} value={window}>
                      {window}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3 border-t border-solid border-slate-200 pt-5">
            <button
              type="submit"
              name="intent"
              value="continue"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-2.5 font-mono text-sm font-bold text-white shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95"
            >
              Continue to review →
            </button>
            <button
              type="submit"
              name="intent"
              value="save"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
            >
              Save draft
            </button>
            <Link href={`${CUSTOMER_PATHS.clarify}?draft=${draft.id}`} className={`${LINK_ARROW} ml-auto`}>
              ← Back to questions
            </Link>
          </div>
        </div>

        <aside className="space-y-3">
          {lastUsed && (lastUsed.locationId || lastUsed.landmark || lastUsed.accessNotes) ? (
            <div className={CARD}>
              <div className="px-4 py-3">
                <p className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  Prefilled from your last request
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  The area, landmark and access notes below were read from the request you submitted
                  {lastUsed.fromDate ? ` on ${new Date(lastUsed.fromDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                  . This platform keeps no address book — it remembers nothing for you, and it will not
                  prefill this again unless you submit another request. Change anything that is different.
                </p>
              </div>
            </div>
          ) : null}

          <HonestGap title="No maps, no coordinates">
            <p>
              Nothing here is geocoded, and no map pin is stored: there is no geolocation service in this
              platform today. The area you pick plus the words you write are what a provider navigates
              by, and both are shown to them exactly as you typed them.
            </p>
          </HonestGap>

          <HonestGap title="The date is a preference">
            <p>
              It is recorded on your request and passed to whoever you hire. It is not a calendar
              booking — there is no scheduling engine behind it — so expect the provider to confirm a
              time before anyone turns up.
            </p>
          </HonestGap>
        </aside>
      </form>
    </IntakeStepShell>
  );
}

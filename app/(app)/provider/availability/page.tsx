import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ArrowRight, CalendarOff, Compass, Info, Plus, Ruler, Trash2 } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL } from '@/components/discovery/tokens';
import HoursMatrix from '@/components/provider/AvailabilitySections';
import { PendingButton } from '@/components/provider/ProviderControls';
import { EmptyState, WorkspaceNotice, WorkspaceSkeleton, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { getProviderContext } from '@/features/provider-workspace/context';
import { PROVIDER_FAILURE_COPY, PROVIDER_PATHS, providerFailureCode } from '@/features/provider-workspace/paths';
import {
  addBlackoutAction,
  addAreaAction,
  pauseAllAvailabilityAction,
  removeAreaAction,
  removeBlackoutAction,
  resumeAvailabilityAction,
  saveAvailabilityRulesAction,
} from '@/features/provider-workspace/actions';
import { blackoutCovers, getAvailability, isPaused, openDays, pauseExpired } from '@/features/provider-workspace/availability';

/**
 * /provider/availability — the weekly hours, the blackouts, the areas, and vacation mode.
 *
 * ⚠️ THREE HONEST SUBSTITUTIONS, EACH EXPLAINED ON THE PAGE RATHER THAN LEFT AS A GAP:
 *
 *   • The "service area map" is the area list. `locations` has latitude and longitude columns and no row in this
 *     database has them set, so a drawn radius would be a picture of a measurement the platform cannot make. The
 *     radius is kept as the distance the provider typed, and the areas are the same records matching reads.
 *   • The blackout picker is a date window, not a holiday calendar. There is no holiday data for any market here,
 *     and inventing public holidays would be wrong in half of them.
 *   • "Pause all availability" is two facts: going offline, which matching reads, and a return date, which nothing
 *     acts on — it is the note-to-self that makes coming back a decision rather than a forgotten setting.
 *
 * ⚠️ THE WEEK IS SEVEN DAYS WITH NO WORKING-WEEK ASSUMPTION. Every day starts empty; an empty day is closed.
 */
export const metadata: Metadata = {
  title: 'Availability',
  description: 'Your hours, your blackouts, your service areas and your pause.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; available?: string }>;

export default async function ProviderAvailabilityPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);

  const failure = providerFailureCode(params.failed);

  return (
    <div className="grid gap-6">
      <header>
        <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">Availability</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          When and where you work
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Your hours tell customers when to expect you, your areas decide which work is matched to you, and your
          blackouts are your own rule about dates you are away.
        </p>
      </header>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That did not save.">
          <p>{PROVIDER_FAILURE_COPY[failure]}</p>
        </WorkspaceNotice>
      ) : null}
      {params.available === 'rules_saved' ? (
        <WorkspaceNotice tone="teal" role="status" title="Availability saved.">
          <p>Your hours, travel note and coverage radius are stored, and readiness has been recalculated.</p>
        </WorkspaceNotice>
      ) : null}
      {params.available === 'blackout_added' ? (
        <WorkspaceNotice tone="teal" role="status" title="Dates blocked out.">
          <p>
            You are shown as away for those dates on this page, and the schedule form on a job refuses a date inside
            the window unless you override it there.
          </p>
        </WorkspaceNotice>
      ) : null}
      {params.available === 'blackout_removed' ? (
        <WorkspaceNotice tone="teal" role="status" title="Blackout removed.">
          <p>Those dates are ordinary again.</p>
        </WorkspaceNotice>
      ) : null}
      {params.available === 'paused' ? (
        <WorkspaceNotice tone="teal" role="status" title="You are paused.">
          <p>
            New matching stops immediately. Nothing you have already accepted is affected, and nothing brings you back
            automatically — resume here when you are ready to work again.
          </p>
        </WorkspaceNotice>
      ) : null}
      {params.available === 'resumed' ? (
        <WorkspaceNotice tone="teal" role="status" title="You are available again.">
          <p>Requests that match your services and areas can reach you, and your return date has been cleared.</p>
        </WorkspaceNotice>
      ) : null}

      <Suspense fallback={<WorkspaceSkeleton />}>
        <AvailabilityBody providerId={provider.id} />
      </Suspense>
    </div>
  );
}

async function AvailabilityBody({ providerId }: { providerId: string }) {
  const availability = await getAvailability(providerId);
  if (availability.unavailable) return <WorkspaceUnavailable what="Your availability" />;

  const today = new Date();
  const paused = isPaused(availability.settings, today);
  const expired = pauseExpired(availability.settings, today);
  const open = openDays(availability.hours);

  return (
    <>
      <section className={`${CARD} p-5`} aria-labelledby="state-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="state-heading" className="text-sm font-bold tracking-tight text-slate-900">
              Your current state
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              {availability.provider.acceptsNewWork
                ? `Available: matching can reach you for ${open.length === 0 ? 'no days yet — fill in your hours below' : `${open.length} day${open.length === 1 ? '' : 's'} a week`}.`
                : 'Offline: no new request is being matched to you. Work you have already accepted is unaffected.'}
            </p>
            {availability.settings.pausedUntil ? (
              <p className={`mt-1.5 text-xs leading-relaxed ${paused ? 'font-semibold text-amber-800' : 'text-slate-500'}`}>
                {paused
                  ? `Paused${availability.settings.pauseReason ? ` (${availability.settings.pauseReason})` : ''} until ${availability.settings.pausedUntil}.`
                  : `Your pause ended on ${availability.settings.pausedUntil}, and you are still shown as ${availability.provider.acceptsNewWork ? 'available' : 'offline'} — nothing changes this automatically.`}
              </p>
            ) : null}
          </div>
          <span className={availability.provider.acceptsNewWork ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1 font-sans text-[11px] font-bold tracking-wider text-primary uppercase' : BADGE_AMBER}>
            {availability.provider.acceptsNewWork ? 'Taking work' : paused ? 'Paused' : 'Offline'}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-solid border-slate-200 pt-4">
          {availability.provider.acceptsNewWork || expired ? (
            <form action={pauseAllAvailabilityAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <input type="hidden" name="provider_id" value={providerId} />
              <input type="hidden" name="next" value={PROVIDER_PATHS.availability} />
              <input type="hidden" name="travel_notes" value={availability.settings.travelNotes ?? ''} />
              <div>
                <label htmlFor="paused_until" className={LABEL}>
                  Away until (optional)
                </label>
                <input id="paused_until" name="paused_until" type="date" className={FIELD} />
              </div>
              <div>
                <label htmlFor="pause_reason" className={LABEL}>
                  Why (optional)
                </label>
                <input id="pause_reason" name="pause_reason" maxLength={200} placeholder="e.g. On site abroad" className={FIELD} />
              </div>
              <PendingButton
                idle="Pause all availability"
                pending="Pausing…"
                className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
            </form>
          ) : (
            <form action={resumeAvailabilityAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="provider_id" value={providerId} />
              <input type="hidden" name="next" value={PROVIDER_PATHS.availability} />
              <input type="hidden" name="travel_notes" value={availability.settings.travelNotes ?? ''} />
              <PendingButton
                idle="Resume availability"
                pending="Resuming…"
                icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
                className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
              />
              <p className="text-xs leading-relaxed text-slate-500">
                Pausing stops matching; it never cancels accepted work, and nothing resumes you automatically.
              </p>
            </form>
          )}
        </div>
      </section>

      <form action={saveAvailabilityRulesAction} className={`${CARD} grid gap-5 p-5`}>
        <input type="hidden" name="provider_id" value={providerId} />
        <input type="hidden" name="next" value={PROVIDER_PATHS.availability} />
        <div>
          <h2 className="text-sm font-bold tracking-tight text-slate-900">Weekly hours</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            Seven days, none of them assumed. Currently open {open.length} day{open.length === 1 ? '' : 's'}:{' '}
            {open.length === 0 ? 'none' : open.map(day => day).join(', ')}.
          </p>
        </div>

        <HoursMatrix hours={availability.hours} />

        <div className="grid gap-4 border-t border-solid border-slate-200 pt-4 sm:grid-cols-2">
          <div>
            <label htmlFor="coverage_radius_km" className={LABEL}>
              Coverage radius in km (optional)
            </label>
            <input
              id="coverage_radius_km"
              name="coverage_radius_km"
              type="number"
              min={1}
              max={500}
              defaultValue={availability.provider.coverageRadiusKm ?? ''}
              aria-describedby="radius-help"
              className={FIELD}
            />
            <p id="radius-help" className="mt-1.5 text-xs leading-relaxed text-slate-500">
              The distance you will travel from your base. It is published as the number you type and is not used to
              match work — the areas below are.
            </p>
          </div>
          <div>
            <label htmlFor="travel_notes" className={LABEL}>
              Travel note (optional)
            </label>
            <textarea
              id="travel_notes"
              name="travel_notes"
              rows={3}
              maxLength={500}
              defaultValue={availability.settings.travelNotes ?? ''}
              placeholder="e.g. Nothing beyond the ring road without a site visit first."
              aria-describedby="travel-help"
              className={FIELD}
            />
            <p id="travel-help" className="mt-1.5 text-xs leading-relaxed text-slate-500">
              For you, not for customers: it appears on this page and nowhere else.
            </p>
          </div>
        </div>

        <div className="border-t border-solid border-slate-200 pt-4">
          <PendingButton
            idle="Save availability rules"
            pending="Saving…"
            className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </form>

      <section className={`${CARD} p-5`} aria-labelledby="blackouts-heading">
        <h2 id="blackouts-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          <CalendarOff aria-hidden="true" className="h-4 w-4 text-primary" />
          Blackout dates
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          Dates you are away. Matching does not read these — the schedule form on a job refuses a date inside a
          window unless you tick the override there, which is the only place the rule bites.
        </p>

        {availability.blackouts.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No blackout dates">
              A window here keeps you out of your own diary. It does not stop a customer asking.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-3 grid gap-2">
            {availability.blackouts.map(blackout => {
              const active = blackoutCovers([blackout], today.toISOString().slice(0, 10)) !== null;
              return (
                <li key={blackout.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3">
                  <span className="text-sm text-slate-700">
                    <strong className="font-semibold">
                      {new Date(`${blackout.startsOn}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </strong>
                    {blackout.endsOn !== blackout.startsOn
                      ? ` → ${new Date(`${blackout.endsOn}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : ''}
                    {blackout.reason ? ` · ${blackout.reason}` : ''}
                  </span>
                  <span className="flex items-center gap-2">
                    {active ? <span className={BADGE_AMBER}>Away now</span> : null}
                    <form action={removeBlackoutAction}>
                      <input type="hidden" name="blackout_id" value={blackout.id} />
                      <input type="hidden" name="next" value={PROVIDER_PATHS.availability} />
                      <PendingButton
                        idle="Remove"
                        pending="Removing…"
                        icon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </form>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <form action={addBlackoutAction} className="mt-4 grid gap-3 border-t border-solid border-slate-200 pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <input type="hidden" name="provider_id" value={providerId} />
          <input type="hidden" name="next" value={PROVIDER_PATHS.availability} />
          <div>
            <label htmlFor="starts_on" className={LABEL}>
              From
            </label>
            <input id="starts_on" name="starts_on" type="date" required className={FIELD} />
          </div>
          <div>
            <label htmlFor="ends_on" className={LABEL}>
              To
            </label>
            <input id="ends_on" name="ends_on" type="date" required className={FIELD} />
          </div>
          <div>
            <label htmlFor="reason" className={LABEL}>
              Reason (optional)
            </label>
            <input id="reason" name="reason" maxLength={200} placeholder="e.g. Annual leave" className={FIELD} />
          </div>
          <PendingButton
            idle="Block these dates"
            pending="Saving…"
            icon={<Plus aria-hidden="true" className="h-4 w-4" />}
            className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
        </form>
      </section>

      <section className={`${CARD} p-5`} aria-labelledby="areas-heading">
        <h2 id="areas-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          <Compass aria-hidden="true" className="h-4 w-4 text-primary" />
          Service areas
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          This is the geography that decides which work reaches you: a request is matched on an area, not on a
          distance. The same list is on your public profile, because it is the same records.
        </p>

        {availability.areas.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No service area selected">
              Without one, location matching finds nothing and no request can be offered to you.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {availability.areas.map(area => (
              <li key={area.id} className="flex items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3">
                <span className="text-sm font-semibold text-slate-800">
                  {area.name}
                  {area.isPrimary ? (
                    <span className="ml-2 align-middle">
                      <span className={BADGE_SLATE}>Primary</span>
                    </span>
                  ) : null}
                </span>
                <form action={removeAreaAction}>
                  <input type="hidden" name="provider_id" value={providerId} />
                  <input type="hidden" name="location_id" value={area.id} />
                  <input type="hidden" name="next" value={PROVIDER_PATHS.availability} />
                  <PendingButton
                    idle="Withdraw"
                    pending="Removing…"
                    className="rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={addAreaAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-solid border-slate-200 pt-4">
          <input type="hidden" name="provider_id" value={providerId} />
          <input type="hidden" name="next" value={PROVIDER_PATHS.availability} />
          <div className="min-w-0 flex-1">
            <label htmlFor="location_id" className={LABEL}>
              Add an area
            </label>
            <select id="location_id" name="location_id" required defaultValue="" className={FIELD}>
              <option value="" disabled>
                Choose an area
              </option>
              {availability.areaOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <PendingButton
            idle="Add area"
            pending="Adding…"
            icon={<Plus aria-hidden="true" className="h-4 w-4" />}
            className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
        </form>

        <p className="mt-4 flex items-start gap-2 rounded-xl border border-solid border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600">
          <Ruler aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            There is no map or radius ring here on purpose. The platform holds no coordinates for its areas — the
            latitude and longitude columns exist and are empty — so a drawn circle would be a picture of a measurement
            nobody made. The areas above are exact; the radius is the number you typed.
          </span>
        </p>
      </section>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          Hours and areas also live on{' '}
          <a href={PROVIDER_PATHS.profile} className="font-semibold text-primary underline underline-offset-2">
            your profile
          </a>
          , because they are the same records. Editing either place changes the same thing.
        </span>
      </p>
    </>
  );
}

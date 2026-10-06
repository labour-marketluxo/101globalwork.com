import Link from 'next/link';
import { redirect } from 'next/navigation';
import IntakeComposer from '@/components/customer/IntakeComposer';
import { HonestGap, IntakeStepShell } from '@/components/customer/IntakeChrome';
import { FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { saveIntakeDraftAction } from '@/features/customer/actions';
import { CUSTOMER_PATHS, suggestService } from '@/features/customer/intake';
import { getIntakeCatalogue, getRequestDraft } from '@/features/customer/requests';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'What do you need done?',
  robots: { index: false, follow: false },
};

type Params = { draft?: string; q?: string; failed?: string; saved?: string };

/**
 * Step 1 — Intent.
 *
 * The only step that can be reached with no draft at all, so it is the only one that reads the
 * catalogues instead of a draft's pinned copies of them.
 *
 * ⚠️ THE SUGGESTION IS COMPUTED WHEN THIS PAGE RENDERS, from the description as it stood at that
 * moment, and the page says so. Nothing re-runs `suggestService` as somebody types — that would mean
 * a round trip per keystroke for a guess — so a visitor who rewrites the whole description sees the
 * step's own age. The honest phrasing is "matched from what was written when this step loaded",
 * because that is exactly when it was matched.
 */
export default async function IntakeIntentPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;

  // Sign-in first, before anything is read: a signed-out visitor who arrived from a marketing CTA
  // should land back on this step, not on the dashboard.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(CUSTOMER_PATHS.newRequest)}`);

  const draft = await getRequestDraft(params.draft);
  const catalogue = draft ? null : await getIntakeCatalogue();

  const needText = draft?.needText || params.q || '';
  const services = draft?.services ?? catalogue?.services ?? [];
  const suggestion = suggestService(needText, services);
  const hasDescription = needText.trim().length >= 5;

  return (
    <IntakeStepShell
      step="intent"
      title="What do you need done?"
      lede="Describe it the way you would describe it to a neighbour. This step decides what the next questions will be, so the more concrete it is, the fewer of them there are."
      failed={params.failed ?? (params.draft && !draft ? 'not_found' : undefined)}
      saved={params.saved === '1'}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form action={saveIntakeDraftAction} className="rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <input type="hidden" name="step" value="intent" />
          <input type="hidden" name="draft_id" value={draft?.id ?? ''} />

          <IntakeComposer defaultValue={needText} />

          <fieldset className="m-0 mt-6 min-w-0 border-0 p-0">
            <legend className={LABEL}>Which service is closest?</legend>

            {suggestion.service && hasDescription ? (
              <div className="mb-3 rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3">
                <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">
                  Suggested
                </p>
                <p className="mt-1 text-sm font-semibold text-primary-deep">
                  {suggestion.service.name}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Matched deterministically from the words in your description
                  {suggestion.tags.length > 0 ? ` (${suggestion.tags.join(', ')})` : ''} when this step
                  loaded. It is a keyword match against the catalogue, not an AI model — there is none
                  wired into this platform — so you can overrule it freely, and doing so changes
                  nothing except who is matched.
                </p>
                {suggestion.hazardous ? (
                  <p className="mt-2 text-xs font-semibold text-amber-800">
                    This trade is one where safety matters more than speed. Read the warning on the
                    logistics step before submitting.
                  </p>
                ) : null}
              </div>
            ) : null}

            <select
              id="service_entity_id"
              name="service_entity_id"
              defaultValue={draft?.serviceEntityId ?? suggestion.service?.id ?? ''}
              className={FIELD}
            >
              <option value="">Not sure — let the description speak for itself</option>
              {services.map(service => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              Choosing a service is how requests reach the providers who do that work. Leaving it blank
              is allowed: the description is what a provider reads first either way.
            </p>
          </fieldset>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-solid border-slate-200 pt-5">
            <button
              type="submit"
              name="intent"
              value="continue"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-2.5 font-sans text-sm font-bold text-white shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95"
            >
              Continue →
            </button>
            <button
              type="submit"
              name="intent"
              value="save"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-sans text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
            >
              Save draft
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <HonestGap title="What happens when you continue">
            <p>
              Continuing saves this as a draft and moves to the clarification questions. Nothing is sent
              to any provider until you submit at the review step, and a draft stays editable until then.
            </p>
          </HonestGap>

          <HonestGap title="Photos and attachments">
            <p>
              There is nowhere to store a file yet — no bucket, no table for attachments — so this step
              accepts none and says so rather than appearing to take one. Words about the make, the size
              or the leak do the same job for a first quote.
            </p>
          </HonestGap>

          <p className="text-xs text-slate-500">
            Already described this somewhere?{' '}
            <Link href="/work" className={LINK_ARROW}>
              See your open requests →
            </Link>
          </p>
        </aside>
      </div>
    </IntakeStepShell>
  );
}

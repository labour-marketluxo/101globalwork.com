import Link from 'next/link';
import { ArrowRight, CircleCheck, Eye, EyeOff, Image as ImageIcon, Info, Plus, ShieldAlert, Trash2 } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import ConfirmSubmit from '@/components/ui/ConfirmSubmit';
import { PendingButton } from '@/components/provider/ProviderControls';
import { EmptyState } from '@/components/provider/WorkspaceNotices';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';
import {
  PROFILE_FIELD_CLASSIFICATION,
  type ProviderProfileEditor,
} from '@/features/provider-workspace/profile';
import { WEEKDAYS, WEEKDAY_LABELS } from '@/features/provider-workspace/hours';
import {
  addAreaAction,
  addPortfolioItemAction,
  addServiceAction,
  publishProfileAction,
  removeAreaAction,
  removePortfolioItemAction,
  removeServiceAction,
  updateProviderProfileAction,
} from '@/features/provider-workspace/actions';

/**
 * The profile editor.
 *
 * ⚠️ THE CLASSIFICATION COMES FIRST, BEFORE THE FIELDS. A provider deciding what to write needs to
 * know what leaves the platform, and finding that out after typing is how somebody publishes a
 * personal phone number into a public description. The panel lists every field, both ways, from the
 * same table the projection is built against.
 *
 * ⚠️ THE SERVICES AND AREAS PANELS ARE NOT COSMETIC. They write `provider_services` and
 * `provider_service_areas`, which are the records matching reads — so the editor is the same control
 * as the marketplace filter, in both directions. Removing the last one is allowed and the confirm text
 * says what it costs.
 *
 * ⚠️ THE PORTFOLIO "UPLOAD" IS A LINK AND A CAPTION. This project has no storage bucket wired up
 * (the assignment evidence form records a link for the same reason), so a file picker here would
 * silently discard the file. The panel says that instead of showing a dropzone that does nothing.
 */

export function ProfileEditorHeader({
  editor,
  readOnlyNotice,
}: {
  editor: ProviderProfileEditor;
  readOnlyNotice?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">Profile</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          {editor.headline ?? editor.displayName}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Everything you change here is either published to customers or kept private — the panel below
          says which, for every field on this page.
        </p>
        {readOnlyNotice}
      </div>

      <div className="flex flex-col items-start gap-2">
        <span className={editor.isPublic ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1 font-sans text-[11px] font-bold tracking-wider text-primary uppercase' : BADGE_AMBER}>
          {editor.isPublic ? 'Published' : 'Not published'}
        </span>
        <Link href={PROVIDER_PATHS.profilePreview} className={LINK_ARROW}>
          <Eye aria-hidden="true" className="h-3.5 w-3.5" />
          Preview the public profile
        </Link>
        {editor.isPublic && editor.slug ? (
          <Link href={`/providers/${editor.slug}`} className={LINK_ARROW}>
            Open the live page
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** What customers see, and what stays yours. Two columns, no prose between them. */
export function FieldClassificationPanel() {
  const publicFields = PROFILE_FIELD_CLASSIFICATION.filter(field => field.classification === 'public');
  const privateFields = PROFILE_FIELD_CLASSIFICATION.filter(field => field.classification === 'private');

  return (
    <section className={`${CARD} p-5`} aria-labelledby="classification-heading">
      <h2 id="classification-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <Info aria-hidden="true" className="h-4 w-4 text-primary" />
        What is public and what is private
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-solid border-primary-subtle bg-primary-surface p-4">
          <p className="inline-flex items-center gap-1.5 font-sans text-[11px] font-bold tracking-wider text-primary uppercase">
            <Eye aria-hidden="true" className="h-3.5 w-3.5" />
            Public
          </p>
          <ul className="mt-2.5 grid gap-2.5">
            {publicFields.map(field => (
              <li key={field.key}>
                <p className="text-xs font-semibold text-slate-900">{field.label}</p>
                <p className="text-xs leading-relaxed text-slate-600">{field.note}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-solid border-slate-200 bg-slate-50 p-4">
          <p className="inline-flex items-center gap-1.5 font-sans text-[11px] font-bold tracking-wider text-slate-600 uppercase">
            <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />
            Private
          </p>
          <ul className="mt-2.5 grid gap-2.5">
            {privateFields.map(field => (
              <li key={field.key}>
                <p className="text-xs font-semibold text-slate-900">{field.label}</p>
                <p className="text-xs leading-relaxed text-slate-600">{field.note}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * The main form.
 *
 * ONE FORM, TWO COMMANDS. The description's length rule belongs to `update_provider_profile_command`
 * and the hours/languages/radius belong to the detail command; they are one button because they are
 * one editing session, and the action runs them in an order where a refusal on the first stops the
 * second.
 */
export function ProfileForm({ editor, nextPath }: { editor: ProviderProfileEditor; nextPath: string }) {
  const descriptionLength = editor.publicDescription.trim().length;

  return (
    <form id="profile-form" action={updateProviderProfileAction} className={`${CARD} grid gap-4 p-5`}>
      <input type="hidden" name="provider_id" value={editor.providerId} />
      <input type="hidden" name="next" value={nextPath} />

      <div>
        <label htmlFor="headline" className={LABEL}>
          Headline
        </label>
        <input
          id="headline"
          name="headline"
          defaultValue={editor.headline ?? ''}
          maxLength={120}
          placeholder="e.g. Registered electrician for homes and small offices"
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor="description" className={LABEL}>
          Public description
        </label>
        <textarea
          id="description"
          name="description"
          rows={7}
          required
          minLength={80}
          defaultValue={editor.publicDescription}
          aria-describedby="description-help"
          className={FIELD}
        />
        <p id="description-help" className="mt-1.5 text-xs leading-relaxed text-slate-500">
          At least 80 characters; {descriptionLength} saved now. The platform scores 120 characters as
          a complete description, 40 as a partial one. Write what you do and the work you want.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="years_experience" className={LABEL}>
            Years of experience (optional)
          </label>
          <input
            id="years_experience"
            name="years_experience"
            type="number"
            min={0}
            max={80}
            defaultValue={editor.yearsExperience ?? ''}
            className={FIELD}
          />
        </div>
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
            defaultValue={editor.coverageRadiusKm ?? ''}
            aria-describedby="radius-help"
            className={FIELD}
          />
          <p id="radius-help" className="mt-1.5 text-xs leading-relaxed text-slate-500">
            How far you travel from your base. A distance, not an address — it is published as written
            and cannot be resolved back to a location.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="languages" className={LABEL}>
          Languages (comma separated)
        </label>
        <input
          id="languages"
          name="languages"
          defaultValue={editor.languages.join(', ')}
          placeholder="English, Hausa, Yoruba"
          aria-describedby="languages-help"
          className={FIELD}
        />
        <p id="languages-help" className="mt-1.5 text-xs leading-relaxed text-slate-500">
          Up to 12, published exactly as written. Entries shorter than two characters are dropped.
        </p>
      </div>

      <fieldset>
        <legend className={LABEL}>Operating hours</legend>
        <p className="mb-2 text-xs leading-relaxed text-slate-500">
          Indicative, not a commitment — an agreed appointment is what binds you. Leave both boxes
          blank for a day you do not work.
        </p>
        <div className="grid gap-2">
          {WEEKDAYS.map(day => {
            const window = editor.operatingHours[day];
            return (
              <div key={day} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-2">
                <label htmlFor={`hours_${day}_open`} className="text-xs font-semibold text-slate-600">
                  {WEEKDAY_LABELS[day]}
                </label>
                <input
                  id={`hours_${day}_open`}
                  name={`hours_${day}_open`}
                  type="time"
                  defaultValue={window?.open ?? ''}
                  aria-label={`${WEEKDAY_LABELS[day]} opening time`}
                  className={FIELD}
                />
                <input
                  name={`hours_${day}_close`}
                  type="time"
                  defaultValue={window?.close ?? ''}
                  aria-label={`${WEEKDAY_LABELS[day]} closing time`}
                  className={FIELD}
                />
              </div>
            );
          })}
        </div>
      </fieldset>

      <label className="flex items-start gap-2.5 text-sm text-slate-700">
        <input name="accepts_new_work" type="checkbox" defaultChecked={editor.acceptsNewWork} className="mt-0.5" />
        <span>
          Accepting new work
          <span className="block text-xs leading-relaxed text-slate-500">
            This is the same switch as the online/offline control in the workspace header — one setting,
            two places it is decided.
          </span>
        </span>
      </label>

      <div className="border-t border-solid border-slate-200 pt-4">
        <PendingButton
          idle="Save profile"
          pending="Saving…"
          className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </form>
  );
}

export function ServicePanel({ editor, nextPath }: { editor: ProviderProfileEditor; nextPath: string }) {
  return (
    <section id="services" className={`${CARD} p-5`} aria-labelledby="services-heading">
      <h2 id="services-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Service categories
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        This list is what matching reads. A request can only reach you for a trade on it, so a missing
        category is work you are invisible for.
      </p>

      {editor.services.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No service category selected">
            Nothing can be matched to this profile until at least one is chosen.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-3 grid gap-2">
          {editor.services.map(service => (
            <li key={service.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3">
              <span className="text-sm font-semibold text-slate-800">
                {service.name}
                {service.isPrimary ? <span className="ml-2 align-middle"><span className={BADGE_SLATE}>Primary</span></span> : null}
              </span>
              <form action={removeServiceAction}>
                <input type="hidden" name="provider_id" value={editor.providerId} />
                <input type="hidden" name="service_entity_id" value={service.id} />
                <input type="hidden" name="next" value={nextPath} />
                <ConfirmSubmit
                  label="Withdraw"
                  triggerClassName="inline-flex items-center gap-1.5 rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-primary hover:text-primary"
                  icon="danger"
                  title={`Stop offering ${service.name}?`}
                  description="Matching stops for this trade immediately, and existing quotes written against it keep their history. If this is your only service, your profile becomes un-matchable and un-publishable until you add another."
                  confirmLabel="Withdraw it"
                />
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={addServiceAction} className="mt-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="provider_id" value={editor.providerId} />
        <input type="hidden" name="next" value={nextPath} />
        <div className="min-w-0 flex-1">
          <label htmlFor="service_entity_id" className={LABEL}>
            Add a service category
          </label>
          <select id="service_entity_id" name="service_entity_id" required defaultValue="" className={FIELD}>
            <option value="" disabled>
              Choose a service
            </option>
            {editor.serviceOptions.map(option => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
        <PendingButton
          idle="Add"
          pending="Adding…"
          icon={<Plus aria-hidden="true" className="h-4 w-4" />}
          className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        />
      </form>
    </section>
  );
}

export function CoveragePanel({ editor, nextPath }: { editor: ProviderProfileEditor; nextPath: string }) {
  return (
    <section id="coverage" className={`${CARD} p-5`} aria-labelledby="coverage-heading">
      <h2 id="coverage-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Coverage areas
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        Where you will actually travel to. Customers see the area name; the platform holds no street
        address for you, and none is published.
      </p>

      {editor.areas.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No service area selected">
            Location matching finds nothing without at least one area.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-3 grid gap-2">
          {editor.areas.map(area => (
            <li key={area.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3">
              <span className="text-sm font-semibold text-slate-800">
                {area.name}
                {area.isPrimary ? <span className="ml-2 align-middle"><span className={BADGE_SLATE}>Primary</span></span> : null}
              </span>
              <form action={removeAreaAction}>
                <input type="hidden" name="provider_id" value={editor.providerId} />
                <input type="hidden" name="location_id" value={area.id} />
                <input type="hidden" name="next" value={nextPath} />
                <ConfirmSubmit
                  label="Withdraw"
                  triggerClassName="inline-flex items-center gap-1.5 rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-primary hover:text-primary"
                  icon="danger"
                  title={`Stop covering ${area.name}?`}
                  description="Requests in this area stop reaching you from now on. Work already accepted there is unaffected. If this is your only area, your profile becomes un-matchable until you add another."
                  confirmLabel="Withdraw it"
                />
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={addAreaAction} className="mt-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="provider_id" value={editor.providerId} />
        <input type="hidden" name="next" value={nextPath} />
        <div className="min-w-0 flex-1">
          <label htmlFor="location_id" className={LABEL}>
            Add a coverage area
          </label>
          <select id="location_id" name="location_id" required defaultValue="" className={FIELD}>
            <option value="" disabled>
              Choose an area
            </option>
            {editor.areaOptions.map(option => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
        <PendingButton
          idle="Add"
          pending="Adding…"
          icon={<Plus aria-hidden="true" className="h-4 w-4" />}
          className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        />
      </form>
    </section>
  );
}

export function PortfolioPanel({ editor, nextPath }: { editor: ProviderProfileEditor; nextPath: string }) {
  return (
    <section id="portfolio" className={`${CARD} p-5`} aria-labelledby="portfolio-heading">
      <h2 id="portfolio-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <ImageIcon aria-hidden="true" className="h-4 w-4 text-primary" />
        Portfolio and proof of work
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        Completed jobs, with a link to photographs you already host. Public items appear on your profile;
        untick one and it stays private to you.
      </p>

      <div className="mt-3 flex items-start gap-3 rounded-xl border border-solid border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p>
          This platform has no image storage connected yet, so items are recorded as a caption and a
          link rather than an uploaded file. A file picker here would take a photograph and discard it,
          which is worse than asking for a link.
        </p>
      </div>

      {editor.portfolio.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No portfolio items yet">
            A provider with no proof of work is asking customers to take a chance. Two or three finished
            jobs change that.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-3 grid gap-2">
          {editor.portfolio.map(item => (
            <li key={item.id} className="rounded-xl border border-solid border-slate-200 p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  {item.description ? (
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.description}</p>
                  ) : null}
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {item.serviceName ? <span>{item.serviceName}</span> : null}
                    {item.linkUrl ? (
                      <a href={item.linkUrl} className="text-primary underline underline-offset-2" rel="noreferrer noopener" target="_blank">
                        Link
                      </a>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={item.isPublic ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-sans text-[11px] font-bold tracking-wider text-primary uppercase' : BADGE_SLATE}>
                    {item.isPublic ? 'Public' : 'Private'}
                  </span>
                  <form action={removePortfolioItemAction}>
                    <input type="hidden" name="item_id" value={item.id} />
                    <input type="hidden" name="next" value={nextPath} />
                    <PendingButton
                      idle="Remove"
                      pending="Removing…"
                      icon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={addPortfolioItemAction} className="mt-4 grid gap-3 rounded-xl border border-solid border-slate-200 p-4">
        <input type="hidden" name="provider_id" value={editor.providerId} />
        <input type="hidden" name="next" value={nextPath} />
        <p className="text-sm font-bold tracking-tight text-slate-900">Add an item</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="portfolio_title" className={LABEL}>
              Title
            </label>
            <input id="portfolio_title" name="title" required minLength={3} maxLength={120} className={FIELD} />
          </div>
          <div>
            <label htmlFor="portfolio_service" className={LABEL}>
              Service category (optional)
            </label>
            <select id="portfolio_service" name="service_entity_id" defaultValue="" className={FIELD}>
              <option value="">Not specified</option>
              {editor.serviceOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="portfolio_description" className={LABEL}>
            Caption (optional, 10 characters or more)
          </label>
          <textarea id="portfolio_description" name="description" rows={3} minLength={10} maxLength={600} className={FIELD} />
        </div>
        <div>
          <label htmlFor="portfolio_link" className={LABEL}>
            Link to photographs (optional, https only)
          </label>
          <input id="portfolio_link" name="link_url" type="url" placeholder="https://" pattern="https://.*" className={FIELD} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input name="is_public" type="checkbox" defaultChecked />
          Show this on my public profile
        </label>
        <div>
          <PendingButton
            idle="Add portfolio item"
            pending="Adding…"
            icon={<Plus aria-hidden="true" className="h-4 w-4" />}
            className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </form>
    </section>
  );
}

/**
 * Publish, or say exactly what is stopping it.
 *
 * The button is only drawn when the database would accept it, but that is not why it is conditional:
 * `publish_provider_profile_command` re-checks everything and refuses. Drawing it only when it would
 * work is how the page avoids offering an action whose only outcome is an error message.
 */
export function PublishPanel({
  editor,
  nextPath,
  requirements,
}: {
  editor: ProviderProfileEditor;
  nextPath: string;
  requirements: { label: string; done: boolean; href: string }[];
}) {
  const remaining = requirements.filter(requirement => !requirement.done);

  if (editor.isPublic) {
    return (
      <section className={`${CARD} p-5`} aria-labelledby="publish-heading">
        <h2 id="publish-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          <CircleCheck aria-hidden="true" className="h-4 w-4 text-primary" />
          Your profile is published
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          Customers can find it, and matching reads your services and areas. Editing anything above takes
          effect on future matches — nothing you change here ends work you have already accepted.
        </p>
      </section>
    );
  }

  return (
    <section className={`${CARD} p-5`} aria-labelledby="publish-heading">
      <h2 id="publish-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <ShieldAlert aria-hidden="true" className="h-4 w-4 text-amber-700" />
        Publish
      </h2>

      <ul className="mt-3 grid gap-2">
        {requirements.map(requirement => (
          <li key={requirement.label} className="flex items-center justify-between gap-3 text-sm">
            <span className={requirement.done ? 'text-slate-500 line-through' : 'font-semibold text-slate-800'}>
              {requirement.label}
            </span>
            {requirement.done ? (
              <CircleCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Link href={requirement.href} className={LINK_ARROW}>
                Fix missing item
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ul>

      <form action={publishProfileAction} className="mt-4 border-t border-solid border-slate-200 pt-4">
        <input type="hidden" name="provider_id" value={editor.providerId} />
        <input type="hidden" name="next" value={nextPath} />
        <PendingButton
          idle="Publish my profile"
          pending="Publishing…"
          className={`inline-flex items-center gap-2 rounded-lg border-0 px-5 py-2.5 font-sans text-xs font-bold tracking-wide uppercase shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            remaining.length === 0
              ? 'bg-secondary text-white hover:bg-secondary-dark'
              : 'bg-slate-300 text-slate-600'
          }`}
        />
        {remaining.length > 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {remaining.length} requirement{remaining.length === 1 ? '' : 's'} still open. The publish
            command checks the same list again and refuses rather than publishing something incomplete.
          </p>
        ) : null}
      </form>
    </section>
  );
}

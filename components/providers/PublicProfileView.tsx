import Link from 'next/link';
import { BadgeCheck, Clock, Languages, MapPin, Ruler } from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CARD, CTA_AMBER, LINK_ARROW } from '@/components/discovery/tokens';
import { WEEKDAYS, WEEKDAY_LABELS, type OperatingHours } from '@/features/provider-workspace/hours';
import type { PublicProviderProfile } from '@/lib/providers/public-profile';

/**
 * The customer-facing provider profile.
 *
 * ⚠️ ONE COMPONENT, TWO ROUTES. The public page at /providers/[slug] renders this, and so does the
 * provider's own Preview. That is the only way "this is what customers see" can be a claim the platform
 * can stand behind: two lookalike components drift the first time one of them is edited.
 *
 * ⚠️ IT RENDERS THE PROJECTION AND NOTHING ELSE. Every field it touches is a column of
 * `get_public_provider_profile_command` — the allowlist. It is handed a row of that projection and has
 * no access to the provider's own tables, so a private field cannot be rendered here by mistake even
 * if somebody adds it to the query.
 */

function operatingHours(value: PublicProviderProfile['operating_hours']): OperatingHours {
  const hours: OperatingHours = {};
  if (!value || typeof value !== 'object') return hours;
  for (const day of WEEKDAYS) {
    const window = value[day];
    if (window?.open && window?.close) hours[day] = { open: window.open, close: window.close };
  }
  return hours;
}

export default function PublicProfileView({ profile }: { profile: PublicProviderProfile }) {
  const verified = Boolean(profile.verification_summary?.verified);
  const credentialCount = Number(profile.verified_credential_count ?? 0);
  const languages = Array.isArray(profile.languages) ? profile.languages : [];
  const portfolio = Array.isArray(profile.portfolio) ? profile.portfolio : [];
  const hours = operatingHours(profile.operating_hours);
  const hoursSet = WEEKDAYS.some(day => hours[day]);
  const requestQuery = profile.service_name ? `?q=${encodeURIComponent(profile.service_name)}` : '';

  return (
    <article className="grid gap-6">
      <header>
        <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">Provider profile</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          {profile.headline ?? profile.service_name ?? 'Service provider'}
        </h1>
        {profile.public_description ? (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{profile.public_description}</p>
        ) : null}
      </header>

      {/* Trust badges: what the platform has actually checked, as distinct from what the provider wrote. */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            verified
              ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1 font-mono text-[11px] font-bold tracking-wider text-primary uppercase'
              : BADGE_SLATE
          }
        >
          {verified ? <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" /> : null}
          {verified ? 'Identity verified' : 'Identity not verified'}
        </span>
        {credentialCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1 font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
            <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
            {credentialCount} verified credential{credentialCount === 1 ? '' : 's'}
          </span>
        ) : null}
        <span className={profile.accepts_new_work ? BADGE_SLATE : BADGE_AMBER}>
          {profile.accepts_new_work ? 'Taking new work' : 'Not taking new work'}
        </span>
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Provider service and trust information">
        <div className={`${CARD} p-4`}>
          <p className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Service</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{profile.service_name ?? '—'}</p>
          {profile.years_experience != null ? (
            <p className="mt-1 text-xs text-slate-500">
              {profile.years_experience} year{profile.years_experience === 1 ? '' : 's'} of experience
            </p>
          ) : null}
        </div>
        <div className={`${CARD} p-4`}>
          <p className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Serves</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
            {profile.location_name ?? '—'}
          </p>
          {profile.coverage_radius_km ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <Ruler aria-hidden="true" className="h-3.5 w-3.5" />
              Travels about {profile.coverage_radius_km}km from base
            </p>
          ) : null}
        </div>
        <div className={`${CARD} p-4`}>
          <p className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Languages</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Languages aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
            {languages.length > 0 ? languages.join(', ') : 'Not stated'}
          </p>
        </div>
      </section>

      {hoursSet ? (
        <section className={`${CARD} p-5`} aria-labelledby="public-hours-heading">
          <h2 id="public-hours-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
            <Clock aria-hidden="true" className="h-4 w-4 text-primary" />
            Typical hours
          </h2>
          <dl className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
            {WEEKDAYS.map(day => (
              <div key={day} className="flex justify-between gap-3 border-b border-dashed border-slate-200 py-1 last:border-0">
                <dt className="text-slate-500">{WEEKDAY_LABELS[day]}</dt>
                <dd className="font-mono text-slate-700">
                  {hours[day] ? `${hours[day]?.open}–${hours[day]?.close}` : 'Closed'}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Indicative. An appointment agreed on the platform is the commitment, not this table.
          </p>
        </section>
      ) : null}

      {portfolio.length > 0 ? (
        <section className={`${CARD} p-5`} aria-labelledby="public-portfolio-heading">
          <h2 id="public-portfolio-heading" className="text-sm font-bold tracking-tight text-slate-900">
            Work they have done
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {portfolio.map(item => (
              <li key={item.id} className="rounded-xl border border-solid border-slate-200 p-4">
                <p className="text-sm font-bold tracking-tight text-slate-900">{item.title}</p>
                {item.service_name ? (
                  <p className="mt-0.5 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                    {item.service_name}
                  </p>
                ) : null}
                {item.description ? (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">{item.description}</p>
                ) : null}
                {item.link_url ? (
                  <a
                    href={item.link_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={`mt-2 ${LINK_ARROW}`}
                  >
                    See the photographs
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-solid border-primary/10 bg-primary-surface p-6">
        <h2 className="text-base font-bold tracking-tight text-slate-900">Need this kind of work?</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
          Start with what you need done. The platform checks the request against this provider&apos;s
          accepted service area and the marketplace eligibility rules before anybody is hired.
        </p>
        <Link href={`/requests/new${requestQuery}`} className={`mt-4 ${CTA_AMBER}`}>
          Start a request
        </Link>
      </section>
    </article>
  );
}

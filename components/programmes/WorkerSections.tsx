import Link from 'next/link';
import { BadgeCheck, EyeOff, FolderPlus, Link2, UserPlus, Users } from 'lucide-react';
import { BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import ConfirmSubmit from '@/components/ui/ConfirmSubmit';
import { formatRelativeTime } from '@/features/settings/device-label';
import {
  assignWorkerAction,
  enrolWorkerAction,
  linkProjectAction,
  recordConsentAction,
  recordCredentialAction,
  unlinkProjectAction,
} from '@/features/programmes/actions';
import {
  CONSENT_SCOPE_COPY,
  CONSENT_SOURCE_COPY,
  CREDENTIAL_KIND_COPY,
  CREDENTIAL_STATE_COPY,
  WORKER_STATE_COPY,
} from '@/features/programmes/copy';
import type { ProgrammeWorker, ProgrammeWorkersRead } from '@/features/programmes/programmes';

/**
 * The worker registry.
 *
 * ⚠️ THE DEFAULT RENDER OF A WORKER HAS NO NAME IN IT. The identity block reads `identity.revealed` and passes the
 * server's decision straight through — pseudonym when it is false, name when it is true, and the reason in both
 * cases. There is no fallback that shows a name "just in case", because the whole point of the registry is that a
 * steward manages people they cannot name.
 *
 * ⚠️ CONSENT IS OFFERED IN TWO SIZES AND NEITHER IS "ALL WORKERS". Programme-wide consent is the owner's to see;
 * project consent is scoped to one project and is honoured only for that project's parties. There is deliberately
 * no bulk control: consent given one person at a time, with a purpose, is consent; a checkbox that grants it for a
 * whole pool is a policy announcement.
 */
export function WorkerRegistryBody({
  read,
  programmeId,
  now,
}: {
  read: ProgrammeWorkersRead;
  programmeId: string;
  now: Date;
}) {
  return (
    <div className="grid gap-8">
      <section aria-labelledby="registry-heading" className="grid gap-3">
        <div>
          <h2 id="registry-heading" className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Users aria-hidden="true" className="h-5 w-5 text-primary" />
            The pool
            <span className="font-mono text-xs font-normal text-slate-500">{read.workers.length}</span>
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">{read.consentNote}</p>
        </div>

        {read.workers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">
            Nobody is enrolled yet. Enrolling records a name and holds it; every list on this page shows a
            pseudonym until the worker consents to be named.
          </p>
        ) : (
          <ul className="grid gap-4">
            {read.workers.map((worker) => (
              <li key={worker.id}>
                <WorkerCard worker={worker} read={read} programmeId={programmeId} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {read.canEnrol ? <EnrolWorkerPanel programmeId={programmeId} cohorts={read.cohorts} /> : null}

      <LinkedProjectsPanel read={read} programmeId={programmeId} />
    </div>
  );
}

function WorkerCard({
  worker,
  read,
  programmeId,
  now,
}: {
  worker: ProgrammeWorker;
  read: ProgrammeWorkersRead;
  programmeId: string;
  now: Date;
}) {
  const state = WORKER_STATE_COPY[worker.state] ?? WORKER_STATE_COPY.enrolled;
  const activeConsents = worker.consents.filter((consent) => consent.revokedAt === null);

  return (
    <article className={`${CARD} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold tracking-tight text-slate-900">{worker.pseudonym}</span>
            <span className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider uppercase ${state.className}`}>
              {state.label}
            </span>
            <span className={BADGE_SLATE}>{worker.regionLabel}</span>
            {worker.hasAccount ? <span className={BADGE_SLATE}>Has an account</span> : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {worker.cohortName ? `${worker.cohortName} · ` : ''}
            enrolled {formatRelativeTime(worker.enrolledAt, now)}
            {worker.stateNote ? ` · ${worker.stateNote}` : ''}
          </p>
        </div>

        {worker.identity.revealed ? (
          <div className="rounded-lg bg-primary-subtle px-3 py-2 text-right">
            <p className="text-sm font-bold tracking-tight text-primary">{worker.identity.name}</p>
            {worker.identity.email ? (
              <p className="font-mono text-[11px] text-slate-600">{worker.identity.email}</p>
            ) : null}
            <p className="mt-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
              {worker.identity.basis === 'programme_consent' ? 'Programme consent' : 'Project consent'}
            </p>
          </div>
        ) : (
          <div className="max-w-sm rounded-lg bg-slate-50 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
              <EyeOff aria-hidden="true" className="h-3 w-3" />
              Identity withheld
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{worker.identity.note}</p>
          </div>
        )}
      </div>

      {worker.skills.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {worker.skills.map((skill) => (
            <li key={skill} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 capitalize">
              {skill}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-4 border-t border-solid border-slate-200 pt-4 lg:grid-cols-2">
        <div>
          <h3 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Credentials</h3>
          {worker.credentials.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Nothing recorded.</p>
          ) : (
            <ul className="mt-2 grid gap-1.5">
              {worker.credentials.map((credential) => {
                const decision = CREDENTIAL_STATE_COPY[credential.state] ?? CREDENTIAL_STATE_COPY.pending;
                return (
                  <li key={credential.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    <span className="text-slate-700">
                      {CREDENTIAL_KIND_COPY[credential.kind] ?? credential.kind}
                      {credential.reference ? (
                        <span className="ml-2 font-mono text-[11px] text-slate-500">{credential.reference}</span>
                      ) : null}
                      {credential.expiresOn ? (
                        <span className="ml-2 text-[11px] text-slate-500">expires {credential.expiresOn}</span>
                      ) : null}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide uppercase ${decision.className}`}>
                      {decision.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {read.canVerify ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-primary">
                Record or decide a credential
              </summary>
              <form action={recordCredentialAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="programme_id" value={programmeId} />
                <input type="hidden" name="worker_id" value={worker.id} />
                <div>
                  <label className={LABEL} htmlFor={`kind-${worker.id}`}>
                    Kind
                  </label>
                  <select id={`kind-${worker.id}`} name="kind" defaultValue="trade_licence" className={FIELD}>
                    {Object.entries(CREDENTIAL_KIND_COPY).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL} htmlFor={`decision-${worker.id}`}>
                    Decision
                  </label>
                  <select id={`decision-${worker.id}`} name="decision" defaultValue="verified" className={FIELD}>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                    <option value="expired">Expired</option>
                    <option value="pending">Submitted, not decided</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL} htmlFor={`reference-${worker.id}`}>
                    Reference
                  </label>
                  <input id={`reference-${worker.id}`} name="reference" type="text" maxLength={120} className={FIELD} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={LABEL} htmlFor={`issued-${worker.id}`}>
                      Issued
                    </label>
                    <input id={`issued-${worker.id}`} name="issued_on" type="date" className={FIELD} />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor={`expires-${worker.id}`}>
                      Expires
                    </label>
                    <input id={`expires-${worker.id}`} name="expires_on" type="date" className={FIELD} />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className={LABEL} htmlFor={`note-${worker.id}`}>
                    Note (optional)
                  </label>
                  <input id={`note-${worker.id}`} name="decision_note" type="text" maxLength={500} className={FIELD} />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
                  >
                    <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
                    Record it
                  </button>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    A verifier can do this and still see only a pseudonym: deciding a document and knowing who
                    somebody is are different permissions, and the platform keeps them apart.
                  </p>
                </div>
              </form>
            </details>
          ) : null}
        </div>

        <div>
          <h3 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Projects and consent
          </h3>

          {worker.allocations.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Not placed on a project yet.</p>
          ) : (
            <ul className="mt-2 grid gap-1.5">
              {worker.allocations.map((allocation) => (
                <li key={allocation.assignmentId} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/projects/${allocation.assignmentId}`} className="font-semibold text-primary no-underline hover:text-primary-dark">
                      {allocation.projectLabel}
                    </Link>
                    <span className="text-slate-500">{allocation.roleLabel}</span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    placed {formatRelativeTime(allocation.allocatedAt, now)}
                    {allocation.endedAt ? ` · ended ${formatRelativeTime(allocation.endedAt, now)}` : ''}
                  </span>

                  {read.canManageConsent ? (
                    <form action={recordConsentAction} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="programme_id" value={programmeId} />
                      <input type="hidden" name="worker_id" value={worker.id} />
                      <input type="hidden" name="scope" value="project" />
                      <input type="hidden" name="assignment_id" value={allocation.assignmentId} />
                      <input type="hidden" name="grant" value="true" />
                      <label className="sr-only" htmlFor={`purpose-${worker.id}-${allocation.assignmentId}`}>
                        Purpose of the consent
                      </label>
                      <input
                        id={`purpose-${worker.id}-${allocation.assignmentId}`}
                        name="purpose"
                        type="text"
                        required
                        minLength={4}
                        maxLength={300}
                        placeholder="Why this project needs their name"
                        className={`${FIELD} w-56`}
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-solid border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
                      >
                        Consent for this project
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {read.canAssign && read.projects.length > 0 ? (
            <form action={assignWorkerAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="programme_id" value={programmeId} />
              <input type="hidden" name="worker_id" value={worker.id} />
              <div>
                <label className={LABEL} htmlFor={`assign-${worker.id}`}>
                  Place on a linked project
                </label>
                <select id={`assign-${worker.id}`} name="assignment_id" required className={`${FIELD} w-64`}>
                  {read.projects.map((project) => (
                    <option key={project.assignmentId} value={project.assignmentId}>
                      {project.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor={`role-${worker.id}`}>
                  Role
                </label>
                <input
                  id={`role-${worker.id}`}
                  name="role_label"
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="Site electrician"
                  className={`${FIELD} w-44`}
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                Place
              </button>
            </form>
          ) : null}

          {activeConsents.length > 0 ? (
            <ul className="mt-3 grid gap-1.5">
              {activeConsents.map((consent) => (
                <li key={consent.id} className="rounded-lg border border-solid border-primary-subtle bg-primary-surface px-3 py-2 text-xs">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">
                      Consent: {CONSENT_SCOPE_COPY[consent.scope] ?? consent.scope}
                    </span>
                    {read.canManageConsent ? (
                      <form action={recordConsentAction}>
                        <input type="hidden" name="programme_id" value={programmeId} />
                        <input type="hidden" name="worker_id" value={worker.id} />
                        <input type="hidden" name="scope" value={consent.scope} />
                        {consent.assignmentId ? (
                          <input type="hidden" name="assignment_id" value={consent.assignmentId} />
                        ) : null}
                        <input type="hidden" name="grant" value="false" />
                        <input type="hidden" name="purpose" value="revoked" />
                        <button
                          type="submit"
                          className="rounded-lg border border-solid border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
                        >
                          Revoke
                        </button>
                      </form>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-600">
                    {consent.purpose} · {CONSENT_SOURCE_COPY[consent.grantSource] ?? consent.grantSource} ·{' '}
                    {formatRelativeTime(consent.grantedAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
              <EyeOff aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                No active consent. The worker stays a pseudonym everywhere on this platform.
                {read.canManageConsent
                  ? ' A consent for somebody with an account here cannot be granted by a steward — only by them, or recorded by platform support from an offline consent — and the platform will refuse it rather than take your word for it.'
                  : ''}
              </span>
            </p>
          )}

          {read.canManageConsent ? (
            <form action={recordConsentAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="programme_id" value={programmeId} />
              <input type="hidden" name="worker_id" value={worker.id} />
              <input type="hidden" name="scope" value="programme" />
              <input type="hidden" name="grant" value="true" />
              <label className="sr-only" htmlFor={`programme-purpose-${worker.id}`}>
                Purpose of the programme-wide consent
              </label>
              <input
                id={`programme-purpose-${worker.id}`}
                name="purpose"
                type="text"
                required
                minLength={4}
                maxLength={300}
                placeholder="Why the programme owner needs their name"
                className={`${FIELD} w-64`}
              />
              <button
                type="submit"
                className="rounded-lg border border-solid border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
              >
                Consent across the programme
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function EnrolWorkerPanel({
  programmeId,
  cohorts,
}: {
  programmeId: string;
  cohorts: ProgrammeWorkersRead['cohorts'];
}) {
  return (
    <section aria-labelledby="enrol-heading" className={`${CARD} p-5 sm:p-6`}>
      <h2 id="enrol-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <UserPlus aria-hidden="true" className="h-4 w-4 text-slate-400" />
        Enrol a worker
      </h2>
      <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-slate-600">
        The name and contact address are stored so the institution can run its own programme, and they are held
        under the same rule as everything else here: no read returns them until the worker consents for a scope the
        reader is entitled to. The response to this form is a pseudonym.
      </p>

      <form action={enrolWorkerAction} className="mt-4 grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="programme_id" value={programmeId} />
        <div>
          <label className={LABEL} htmlFor="legal_name">
            Name
          </label>
          <input id="legal_name" name="legal_name" type="text" required minLength={2} maxLength={160} className={FIELD} />
        </div>
        <div>
          <label className={LABEL} htmlFor="contact_email">
            Contact email (optional)
          </label>
          <input id="contact_email" name="contact_email" type="email" maxLength={254} className={FIELD} />
        </div>
        <div>
          <label className={LABEL} htmlFor="region_label">
            Region (optional)
          </label>
          <input
            id="region_label"
            name="region_label"
            type="text"
            maxLength={120}
            placeholder="Defaults to the programme's own region"
            className={FIELD}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="cohort_id">
            Cohort (optional)
          </label>
          <select id="cohort_id" name="cohort_id" className={FIELD} defaultValue="">
            <option value="">Not in a cohort</option>
            {cohorts.map((cohort) => (
              <option key={cohort.id} value={cohort.id}>
                {cohort.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="skills">
            Skills (optional)
          </label>
          <input
            id="skills"
            name="skills"
            type="text"
            placeholder="electrical, maintenance, safety compliance"
            className={FIELD}
          />
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Comma separated, at most twelve. They are normalised on the server — trimmed and lower-cased — because
            a skill field with four spellings of the same trade makes every distribution on the insights page
            meaningless.
          </p>
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase transition-colors hover:bg-secondary-dark"
          >
            Enrol under a pseudonym
          </button>
        </div>
      </form>
    </section>
  );
}

/**
 * The programme's projects.
 *
 * ⚠️ THE LINK LIST IS "PROJECTS YOU ARE PERSONALLY A PARTY TO", and the panel says why. An institution cannot
 * attach itself to somebody's job; a customer or provider on the project brings the programme in. A steward who is
 * on no projects sees an empty picker and an explanation rather than a field asking for a project id — which the
 * platform would refuse, and which should never be typed into a browser anyway.
 */
function LinkedProjectsPanel({ read, programmeId }: { read: ProgrammeWorkersRead; programmeId: string }) {
  return (
    <section aria-labelledby="links-heading" className={`${CARD} p-5`}>
      <h2 id="links-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <Link2 aria-hidden="true" className="h-4 w-4 text-slate-400" />
        Projects this programme can work on
      </h2>

      {read.projects.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          No projects are linked. Linking is done by a party to the project — usually from the project itself — and
          a worker can only be placed on a project that is linked here.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {read.projects.map((project) => (
            <li key={project.assignmentId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <span className="text-slate-800">
                {project.label}
                <span className="ml-2 font-mono text-[11px] text-slate-500">{project.status}</span>
              </span>
              <span className="flex items-center gap-3">
                <Link href={`/projects/${project.assignmentId}`} className={LINK_ARROW}>
                  Open
                </Link>
                {read.canAssign ? (
                  <form action={unlinkProjectAction}>
                    <input type="hidden" name="programme_id" value={programmeId} />
                    <input type="hidden" name="assignment_id" value={project.assignmentId} />
                    <ConfirmSubmit
                      label="Unlink"
                      triggerClassName="rounded-lg border border-solid border-transparent bg-transparent px-2 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:text-slate-800"
                      icon="danger"
                      title="Unlink this project?"
                      description="The programme stops being able to place workers on it. Nothing is erased: existing placements are marked as ended and stay in the record, and the dashboard keeps counting them."
                      confirmLabel="Unlink"
                    />
                  </form>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {read.canAssign && read.linkableProjects.length > 0 ? (
        <form action={linkProjectAction} className="mt-4 grid gap-3 border-t border-solid border-slate-200 pt-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input type="hidden" name="programme_id" value={programmeId} />
          <div>
            <label className={LABEL} htmlFor="link_assignment">
              Link a project you are on
            </label>
            <select id="link_assignment" name="assignment_id" required className={FIELD}>
              {read.linkableProjects.map((project) => (
                <option key={project.assignmentId} value={project.assignmentId}>
                  {project.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
            >
              <FolderPlus aria-hidden="true" className="h-3.5 w-3.5" />
              Link
            </button>
          </div>
        </form>
      ) : read.canAssign ? (
        <p className="mt-4 border-t border-solid border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
          Nothing to link: this picker lists the projects you are personally a party to, and either you are on none
          of them or they are all linked already. The platform will not accept a project reference from somebody who
          is not on the project, which is why there is no field to type an id into.
        </p>
      ) : null}
    </section>
  );
}

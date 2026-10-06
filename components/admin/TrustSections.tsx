import Link from 'next/link';
import { CircleCheck, ExternalLink, FileText, ShieldAlert, TriangleAlert } from '@/components/ui/icons';
import {
  CASE_STATE_COPY,
  CREDENTIAL_DECISION_COPY,
  CREDENTIAL_STATUS_COPY,
  VERIFICATION_DECISION_COPY,
  VERIFICATION_STATUS_COPY,
  caseBadge,
} from '@/features/admin/copy';
import type { AuditAttempt, CredentialServiceImpact, RiskSignal, VerificationDecisionRecord } from '@/features/admin/trust';
import type { TrustCase } from '@/features/admin/trust';

/**
 * The trust console's shared pieces.
 *
 * ⚠️ THE BADGES AND THE HISTORY ARE HERE BECAUSE THREE PAGES SHOW THE SAME ONES. A verification decision, a
 * credential decision and a case event all read as "who, when, why" — and three hand-written versions of
 * that line is how one of them quietly stops showing the reason code.
 */

export function StatusBadge({ status, kind }: { status: string; kind: 'verification' | 'credential' }) {
  const copy = (kind === 'verification' ? VERIFICATION_STATUS_COPY : CREDENTIAL_STATUS_COPY)[status]
    ?? { label: status.replaceAll('_', ' '), tone: 'slate' as const };
  return <span className="admin-severity" data-severity={copy.tone === 'teal' ? 'low' : 'high'}>{copy.label}</span>;
}

export function CaseBadge({ item }: { item: Pick<TrustCase, 'severity' | 'legalHold'> }) {
  const copy = caseBadge(item);
  return (
    <span className="admin-severity" data-severity={copy.tone === 'amber' ? 'high' : 'low'}>
      {copy.label === 'Legal hold' ? <ShieldAlert aria-hidden="true" className="h-3 w-3" /> : null}
      {copy.label}
    </span>
  );
}

export function CaseStateBadge({ state }: { state: string }) {
  const copy = CASE_STATE_COPY[state] ?? { label: state.replaceAll('_', ' '), tone: 'slate' as const };
  return <span className="admin-severity" data-severity={copy.tone === 'teal' ? 'low' : 'high'}>{copy.label}</span>;
}

export function DecisionBadge({ decision, kind }: { decision: string; kind: 'verification' | 'credential' }) {
  // Indexed through a plain string map: the two vocabularies overlap but not exactly (a credential can be
  // revoked, a verification can be escalated), and a decision the app does not know still has to render.
  const copy: Record<string, string> = kind === 'verification' ? VERIFICATION_DECISION_COPY : CREDENTIAL_DECISION_COPY;
  return (
    <span className="admin-severity" data-severity={decision === 'verified' ? 'low' : 'high'}>
      {copy[decision] ?? decision.replaceAll('_', ' ')}
    </span>
  );
}

/**
 * The checks that fired.
 *
 * ⚠️ AN EMPTY LIST IS STATED, NOT OMITTED. "No check fired" is information an operator needs before approving
 * something, and a section that vanishes when it is empty reads as a rendering fault rather than a result.
 * The last line says what these are: derived from rows, not a risk model.
 */
export function SignalList({ signals }: { signals: RiskSignal[] }) {
  if (signals.length === 0) {
    return (
      <p className="admin-incident-meta">
        <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />
        No check fired on this submission. That is not the same as a clean document — the checks below are the
        ones the platform can run by itself.
      </p>
    );
  }

  return (
    <>
      <ul className="admin-facts">
        {signals.map(signal => (
          <li key={signal.key}>
            <strong>
              {signal.level === 'critical' ? <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" /> : null}
              {signal.label}
            </strong>
            <span>{signal.detail}</span>
          </li>
        ))}
      </ul>
      <p className="admin-incident-meta">
        These are comparisons over the platform&apos;s own rows — a missing reference, a reference somebody else
        claims, a jurisdiction that does not match the market. There is no automated risk model, and the
        platform contracts with no identity or registry service, so a check that did NOT fire is not a
        verification: reading the document is the reviewer&apos;s work.
      </p>
    </>
  );
}

export function DecisionHistory({
  decisions,
  kind,
}: {
  /**
   * `assignedTo` is optional because only a verification decision can carry one — a credential has nobody to
   * escalate to. Widening the prop rather than forking the component keeps one rendering of "who, when, why".
   */
  decisions: (Omit<VerificationDecisionRecord, 'assignedTo'> & { assignedTo?: string | null })[];
  kind: 'verification' | 'credential';
}) {
  if (decisions.length === 0) {
    return <p className="empty-admin">No decision has been recorded against this record yet.</p>;
  }
  return (
    <div className="admin-list">
      {decisions.map(decision => (
        <article key={decision.id}>
          <div>
            <strong>
              <DecisionBadge decision={decision.decision} kind={kind} />
              {' '}
              {decision.note}
            </strong>
            <span>
              Reason: {decision.reasonCode.replaceAll('_', ' ')}
              {decision.policyVersion ? ` · policy ${decision.policyVersion}` : ''}
              {decision.expiresAt ? ` · expiry set to ${new Date(decision.expiresAt).toLocaleDateString('en-GB')}` : ''}
              {decision.assignedTo ? ` · assigned to ${decision.assignedTo}` : ''}
            </span>
          </div>
          <small>
            {decision.decidedBy} · {decision.decidedAt ? new Date(decision.decidedAt).toLocaleString('en-GB') : 'time not recorded'}
          </small>
        </article>
      ))}
    </div>
  );
}

export function AttemptList({ attempts }: { attempts: AuditAttempt[] }) {
  if (attempts.length === 0) {
    return <p className="empty-admin">The audit stream holds no event for this submission.</p>;
  }
  return (
    <ul className="admin-session-list">
      {attempts.map(attempt => (
        <li key={`${attempt.action}-${attempt.occurredAt ?? 'unknown'}`}>
          <strong>{attempt.action.replaceAll('_', ' ')}</strong>
          <span>
            {attempt.actor} ({attempt.actorType})
            {attempt.reasonCode ? ` · ${attempt.reasonCode.replaceAll('_', ' ')}` : ''}
          </span>
          <small>{attempt.occurredAt ? new Date(attempt.occurredAt).toLocaleString('en-GB') : 'time not recorded'}</small>
        </li>
      ))}
    </ul>
  );
}

/**
 * What approving or revoking this credential does to the provider's covered categories.
 *
 * ⚠️ THE LIST IS COMPUTED FROM THE COVERAGE THE PLATFORM ACTUALLY HAS, and the last line states the limit:
 * matching reads `provider_services`, not credentials, so this changes the record rather than the gate. An
 * operator deciding a revocation is entitled to know exactly which categories lose their last verified
 * document, and equally entitled to know that nothing switches off automatically.
 */
export function ServiceImpactList({ services, credentialStatus }: { services: CredentialServiceImpact[]; credentialStatus: string }) {
  if (services.length === 0) {
    return (
      <p className="empty-admin">
        This credential does not name any service category, which means it covers the provider&apos;s whole
        business as far as the platform is concerned. There is nothing here to compute coverage from.
      </p>
    );
  }
  const currentlyCovered = credentialStatus === 'verified';
  return (
    <>
      <div className="admin-list">
        {services.map(service => {
          const remainsCovered = service.coveredByAnotherCredential;
          return (
            <article key={service.serviceEntityId}>
              <div>
                <strong>{service.serviceName}</strong>
                <span>
                  {service.providerOffersIt ? 'Offered by this provider' : 'Not currently offered by this provider'}
                  {' · '}
                  {remainsCovered
                    ? 'another verified credential also covers it'
                    : 'no other verified credential covers it'}
                </span>
              </div>
              <small>
                {currentlyCovered
                  ? service.coveredByThisCredential || remainsCovered
                    ? 'Covered today'
                    : 'This credential is verified but expired'
                  : 'Not covered by this credential today'}
              </small>
            </article>
          );
        })}
      </div>
      <p className="admin-incident-meta">
        Approving or revoking recomputes the provider&apos;s onboarding progress and search readiness. It does not
        withdraw a service category from matching: eligibility is read from the provider&apos;s own service list,
        which nothing here edits. If a category must stop being offered, that is a deliberate change on the
        provider&apos;s record.
      </p>
    </>
  );
}

export function DocumentReference({ reference, attachedAt, label }: { reference: string | null; attachedAt?: string | null; label: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {reference ? (
          <>
            <FileText aria-hidden="true" className="h-3.5 w-3.5" />
            {' '}
            {reference}
            {attachedAt ? <span className="admin-incident-meta"> · recorded {new Date(attachedAt).toLocaleString('en-GB')}</span> : null}
          </>
        ) : (
          <span className="admin-incident-meta">Nothing on file for this submission</span>
        )}
      </dd>
    </div>
  );
}

export function ExternalProfileLink({ slug, label = 'Public profile' }: { slug: string | null; label?: string }) {
  if (!slug) return null;
  return (
    <Link className="text-button" href={`/providers/${slug}`} target="_blank" rel="noreferrer">
      {label} <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
    </Link>
  );
}

import { BadgeCheck, TriangleAlert } from '@/components/ui/icons';
import { PAYMENT_ANOMALY_COPY, PAYOUT_BLOCK_COPY, CHARGEBACK_RESOLUTION_COPY } from '@/features/admin/copy';
import { formatMoney } from '@/features/provider-workspace/format';

/**
 * The money console's two shared pieces.
 *
 * ⚠️ ANOMALIES AND BLOCK REASONS ARE PRINTED IN WORDS, NOT COLOURS. "Blocked" tells an operator nothing about
 * whether it is their hold or a rule; the sentence beside it is the difference between releasing something and
 * escalating it.
 */

export function AnomalyTags({ anomalies }: { anomalies: string[] }) {
  if (anomalies.length === 0) {
    return (
      <span className="admin-incident-meta">
        <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
        Nothing disagrees
      </span>
    );
  }
  return (
    <span className="admin-row-actions">
      {anomalies.map(anomaly => (
        <span key={anomaly} className="admin-severity" data-severity="high">
          <TriangleAlert aria-hidden="true" className="h-3 w-3" />
          {PAYMENT_ANOMALY_COPY[anomaly] ?? anomaly.replaceAll('_', ' ')}
        </span>
      ))}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const settled = status === 'succeeded' || status === 'paid';
  const attention = ['failed', 'blocked', 'mismatch', 'rejected', 'needs_attention'].includes(status);
  return (
    <span className="admin-severity" data-severity={attention ? 'high' : settled ? 'low' : 'high'}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

export function BlockReason({ reason, holdReason }: { reason: string | null; holdReason?: string | null }) {
  if (holdReason) {
    return <span className="admin-severity" data-severity="high">Held: {holdReason.replaceAll('_', ' ')}</span>;
  }
  if (!reason) return <span className="admin-severity" data-severity="low">Eligible</span>;
  return <span className="admin-severity" data-severity="high">{PAYOUT_BLOCK_COPY[reason] ?? reason.replaceAll('_', ' ')}</span>;
}

export function Money({ minor, currency }: { minor: number | null; currency: string | null }) {
  return <span className="numeric">{formatMoney(minor, currency, 'no amount recorded')}</span>;
}

export function ResolutionLabel({ resolution }: { resolution: string | null }) {
  if (!resolution) return <span className="admin-severity" data-severity="high">No resolution recorded</span>;
  return (
    <span className="admin-severity" data-severity={resolution === 'cleared_for_payout' ? 'low' : 'high'}>
      {CHARGEBACK_RESOLUTION_COPY[resolution] ?? resolution.replaceAll('_', ' ')}
    </span>
  );
}

/** One line per recorded decision, with the reason code that makes it explainable. */
export function DecisionList({
  decisions,
}: {
  decisions: { action: string; reasonCode: string; note: string; resolution?: string | null; evidenceReference?: string | null; decidedBy: string; decidedAt: string | null }[];
}) {
  if (decisions.length === 0) {
    return <p className="empty-admin">No decision has been recorded against this case yet.</p>;
  }
  return (
    <div className="admin-list">
      {decisions.map((decision, index) => (
        <article key={`${decision.action}-${decision.decidedAt ?? index}`}>
          <div>
            <strong>{decision.action.replaceAll('_', ' ')}</strong>
            <span>Reason {decision.reasonCode.replaceAll('_', ' ')} · {decision.note}</span>
            {decision.evidenceReference ? <span>Reference {decision.evidenceReference}</span> : null}
          </div>
          <small>
            {decision.decidedBy}
            {decision.decidedAt ? ` · ${new Date(decision.decidedAt).toLocaleString('en-GB')}` : ''}
          </small>
        </article>
      ))}
    </div>
  );
}

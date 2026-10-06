'use client';

import { useActionState, useState } from 'react';
import { Eye, TriangleAlert } from '@/components/ui/icons';
import { revealAccountContactAction, type RevealState } from '@/features/admin/actions';
import { ADMIN_FAILURE_COPY, type ReasonCode } from '@/features/admin/copy';

/**
 * Reveal a contact address, once, on purpose.
 *
 * ⚠️ THE RAW VALUE IS RETURNED TO THIS COMPONENT, NOT RENDERED INTO THE PAGE. That is the whole reason it
 * is a client component using `useActionState`: a server-rendered page would have to put the address
 * into HTML that stays in the browser's history and in any cache between here and the operator, and a
 * redirect would have to put it in a URL. Here it exists only in the response to the request that asked
 * for it, and the database has already written the audit row naming the operator, the reason and their
 * note before it sent anything back.
 *
 * ⚠️ THE CONTROL STAYS VISIBLE WHEN IT CANNOT BE USED, WITH THE REASON. An operator who cannot reveal a
 * contact needs to know whether that is a permission they lack or a feature that is missing; a hidden
 * button answers neither question.
 */
export default function RevealContactControl({
  accountId,
  reasons,
  canReveal,
  disabledReason,
}: {
  accountId: string;
  reasons: ReasonCode[];
  canReveal: boolean;
  disabledReason?: string;
}) {
  const initial: RevealState = { status: 'idle' };
  const [state, formAction, pending] = useActionState(revealAccountContactAction, initial);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      // Clipboard access is refused in some browsers and frames. The value is on screen and
      // selectable, so the operator is not blocked — saying nothing is better than a false "copied".
      setCopied(null);
    }
  }

  if (!canReveal) {
    return (
      <div className="admin-control-unavailable">
        Reveal raw contact
        <span className="admin-control-unavailable-why">{disabledReason ?? 'Your role cannot reveal contact details.'}</span>
      </div>
    );
  }

  return (
    <div className="admin-reveal">
      <p className="admin-reveal-warning">
        <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Revealing writes an audit record with your name, your reason and your note. The address stays on
          this screen only — it is not stored in the page, so a reload hides it again.
        </span>
      </p>

      <form action={formAction} className="grid gap-2">
        <input type="hidden" name="account_id" value={accountId} />
        <label className="admin-field-label" htmlFor="reveal-reason">
          Reason code
        </label>
        <select id="reveal-reason" name="reason_code" required defaultValue="" className="admin-field">
          <option value="" disabled>
            Choose a reason
          </option>
          {reasons.map(reason => (
            <option key={reason.code} value={reason.code}>
              {reason.label}
            </option>
          ))}
        </select>
        <label className="admin-field-label" htmlFor="reveal-note">
          What you need it for
        </label>
        <textarea
          id="reveal-note"
          name="note"
          required
          minLength={10}
          maxLength={2000}
          rows={3}
          placeholder="e.g. Ticket #4821 — the account holder asked us to confirm which address is on file."
          className="admin-field"
        />
        <div className="admin-row-actions">
          <button type="submit" className="admin-trigger-quiet" disabled={pending} aria-busy={pending}>
            <Eye aria-hidden="true" className="h-4 w-4" />
            {pending ? 'Revealing…' : 'Reveal raw contact'}
          </button>
          <span className="admin-incident-meta">This is recorded. It cannot be undone.</span>
        </div>
      </form>

      {state.status === 'error' ? (
        <p className="notice" role="alert">
          {ADMIN_FAILURE_COPY[state.code]}
        </p>
      ) : null}

      {state.status === 'ok' ? (
        <div className="grid gap-2">
          {state.email ? (
            <div>
              <p className="admin-field-label">Email on file</p>
              <code>{state.email}</code>
              <button type="button" className="text-button" onClick={() => copy(state.email ?? '', 'email')}>
                {copied === 'email' ? 'Copied' : 'Copy email'}
              </button>
            </div>
          ) : null}
          {state.phone ? (
            <div>
              <p className="admin-field-label">Phone on file</p>
              <code>{state.phone}</code>
              <button type="button" className="text-button" onClick={() => copy(state.phone ?? '', 'phone')}>
                {copied === 'phone' ? 'Copied' : 'Copy phone'}
              </button>
            </div>
          ) : null}
          {!state.email && !state.phone ? (
            <p className="empty-admin">This account has no email or phone recorded.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

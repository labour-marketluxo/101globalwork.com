'use client';

import { useId, useRef } from 'react';
import { IdCard, TriangleAlert } from 'lucide-react';
import type { ReasonCode } from '@/features/admin/copy';

/**
 * The reason-code controller: one control, one modal, every consequential admin write.
 *
 * ⚠️ WHY A MODAL AND NOT A SELECT ON THE PAGE. These actions each carry a hidden pair of identifiers (the
 * account, the provider, the restriction) that a form post must not lose, and several of them sit
 * side by side in a table row where an inline select plus a note field per row would be a wall of
 * inputs an operator scrolls past. The modal collects the two things every one of these writes needs —
 * a reason from the platform's own vocabulary and a note that says what happened — and the confirm
 * button submits the SAME form the trigger lives in, so the hidden identifiers travel with it.
 *
 * ⚠️ NATIVE `<dialog>`, FOR THE BEHAVIOUR THAT IS EASY TO GET WRONG. `showModal()` makes the rest of the
 * page inert (so a keyboard user cannot tab into the row behind the question), moves focus in, and
 * restores it on close; Escape closes it. The ARIA role is set explicitly because support for the
 * implicit one is still uneven.
 *
 * ⚠️ WITHOUT JAVASCRIPT THE TRIGGER STILL SUBMITS. It renders as `type="submit"` and the click handler
 * only intercepts it to open the dialog first — so a browser whose bundle failed posts the form with no
 * reason code, and the database refuses it with "choose a reason". That is the correct failure: the
 * alternative is a disabled button on the one screen an operator may have opened in a hurry.
 */
export default function ReasonCodeControl({
  triggerLabel,
  triggerClassName,
  title,
  description,
  confirmLabel,
  confirmClassName,
  reasons,
  noteLabel,
  notePlaceholder,
  tone = 'danger',
  disabled = false,
  disabledReason,
  extraFields,
}: {
  triggerLabel: string;
  triggerClassName: string;
  title: string;
  description: string;
  confirmLabel: string;
  confirmClassName: string;
  reasons: ReasonCode[];
  noteLabel: string;
  notePlaceholder?: string;
  tone?: 'danger' | 'standard';
  /** Rendered inert with the reason shown, rather than hidden, when the operator cannot use it. */
  disabled?: boolean;
  disabledReason?: string;
  /**
   * Fields this particular action needs in the dialog — a restriction kind, a target standing. They travel
   * with the reason code in the same form, which is why a page cannot forget to include one.
   */
  extraFields?: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const noReasons = reasons.length === 0;

  if (disabled) {
    return (
      <span className="admin-control-unavailable" title={disabledReason}>
        {triggerLabel}
        <span className="admin-control-unavailable-why">{disabledReason}</span>
      </span>
    );
  }

  return (
    <>
      <button
        type="submit"
        className={triggerClassName}
        onClick={event => {
          // Intercepted only when scripting is available: without it this falls through and submits.
          event.preventDefault();
          dialogRef.current?.showModal();
        }}
      >
        {tone === 'danger' ? <TriangleAlert aria-hidden="true" className="h-4 w-4" /> : <IdCard aria-hidden="true" className="h-4 w-4" />}
        {triggerLabel}
      </button>

      <dialog
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="m-auto w-full max-w-lg rounded-lg border border-solid border-[var(--line)] bg-[var(--color-surface)] p-6 text-left shadow-xl backdrop:bg-slate-900/50"
      >
        <h2 id={titleId} className="admin-dialog-title">{title}</h2>
        <p id={descriptionId} className="admin-dialog-lede">{description}</p>

        {extraFields}

        <label className="admin-field-label" htmlFor={`${titleId}-reason`}>
          Reason code
        </label>
        {noReasons ? (
          <p className="notice" role="alert">
            The reason-code list could not be loaded, so this action cannot be recorded and will not run.
            Reload the page and try again.
          </p>
        ) : (
          <select id={`${titleId}-reason`} name="reason_code" required defaultValue="" className="admin-field">
            <option value="" disabled>
              Choose a reason
            </option>
            {reasons.map(reason => (
              <option key={reason.code} value={reason.code}>
                {reason.label}
              </option>
            ))}
          </select>
        )}

        <label className="admin-field-label" htmlFor={`${titleId}-note`}>
          {noteLabel}
        </label>
        <textarea
          id={`${titleId}-note`}
          name="note"
          required
          minLength={10}
          maxLength={2000}
          rows={4}
          placeholder={notePlaceholder ?? 'What happened, and what should somebody reading this in six months understand?'}
          className="admin-field"
        />
        <p className="admin-dialog-hint">
          This note and the reason code are written to the audit log with your account and the moment you
          confirm. The record cannot be edited afterwards.
        </p>

        <div className="admin-dialog-actions">
          <button type="button" className="secondary-button" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button type="submit" className={confirmClassName} disabled={noReasons}>
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}

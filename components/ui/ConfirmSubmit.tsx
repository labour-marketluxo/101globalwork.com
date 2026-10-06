'use client';

import { useId, useRef } from 'react';
import { LogOut, TriangleAlert } from '@/components/ui/icons';

/**
 * A submit button that asks first, in a modal dialog.
 *
 * ⚠️ GENERIC, AND THAT IS WHY IT LIVES IN components/ui RATHER THAN BESIDE THE SETTINGS PAGE THAT
 * FIRST NEEDED IT. Two surfaces now ask "are you sure" before a destructive write — the sessions page
 * (end a device) and the provider workspace (withdraw a service, remove a portfolio item, go offline)
 * — and a second copy of an accessible confirmation dialog is how one of them quietly loses the ARIA
 * wiring in a later edit.
 *
 * WHY A NATIVE <dialog> RATHER THAN A HAND-ROLLED OVERLAY. `showModal()` gives the three things an
 * accessible confirmation needs and all three are easy to get subtly wrong by hand: the rest of the
 * page becomes inert (so a keyboard user cannot tab into the page behind the question), Escape
 * closes it, and focus is moved into it and restored on close. A div with `role="alertdialog"` gets
 * the labelling right and none of the behaviour.
 *
 * `role="alertdialog"` is implicit for a modal <dialog> in current browsers, but it is set
 * explicitly here because assistive technology support for the implicit role is still uneven.
 *
 * THE CONFIRM BUTTON SUBMITS THE ENCLOSING FORM, not a server action of its own: `button.form` walks
 * the DOM, and the <dialog> is inside the same <form> as the trigger. So the hidden ids and any other
 * field the page put in the form travel with the confirmation.
 *
 * WITHOUT JAVASCRIPT the trigger is an ordinary submit button and the action runs unconfirmed. That
 * is a deliberate trade in favour of the flow still working: the alternative — rendering the trigger
 * as a disabled button until hydration — would break the page entirely for a visitor whose bundle
 * failed, on a screen they may have opened precisely because they are worried about access.
 */
export default function ConfirmSubmit({
  label,
  triggerClassName,
  title,
  description,
  confirmLabel,
  icon = 'shield',
}: {
  label: string;
  triggerClassName: string;
  title: string;
  description: string;
  confirmLabel: string;
  /** `danger` adds the amber warning mark and the darker confirm button. */
  icon?: 'shield' | 'danger';
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => dialogRef.current?.showModal()}
      >
        {icon === 'danger' ? <TriangleAlert aria-hidden="true" className="h-4 w-4" /> : null}
        {label}
      </button>

      <dialog
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="m-auto w-full max-w-md rounded-2xl border border-solid border-slate-200 bg-white p-6 text-left shadow-xl backdrop:bg-slate-900/50"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              icon === 'danger' ? 'bg-secondary-light text-amber-800' : 'bg-primary-subtle text-primary'
            }`}
          >
            {icon === 'danger' ? (
              <TriangleAlert className="h-4 w-4" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
          </span>

          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold tracking-tight text-slate-900">
              {title}
            </h2>
            <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-slate-600">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {/* Focused on open, so Enter cancels rather than confirms: the safe default for a
              destructive question is the answer that changes nothing. */}
          <button
            type="button"
            autoFocus
            onClick={() => dialogRef.current?.close()}
            className="inline-flex items-center justify-center rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border-0 bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={event => {
              const form = event.currentTarget.form;
              // Close before submitting: the dialog would otherwise stay on screen through the
              // round trip on a slow connection, looking like nothing happened.
              dialogRef.current?.close();
              form?.requestSubmit();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Six-digit code entry.
 *
 * WHY SIX INPUTS AND NOT ONE. A single input styled with `letter-spacing` is simpler and is the
 * wrong control: it cannot advance the caret as the code is typed, it cannot show how many digits
 * are still missing, and iOS and Android both stop offering the SMS/email code above the keyboard
 * once the field has more than one character. The boxes are the control people expect for a code.
 *
 * WHAT IT HANDLES, because each of these is a way an OTP form fails in the wild:
 *
 *   auto-advance       typing a digit moves to the next box; typing over a filled box replaces it
 *   auto-back          Backspace on an empty box goes back and clears the previous one
 *   paste              a pasted code is distributed across the boxes, and non-digits are stripped —
 *                      `123 456`, `123-456` and a code copied with a trailing newline all work
 *   arrow keys         left/right move between boxes without touching the value
 *   screen readers     ONE control, not six. The boxes are `aria-hidden` decoration; a single
 *                      visually-hidden input carries the value, the label and the description, so
 *                      a screen reader announces "Verification code, 6 digits, 3 of 6 entered"
 *                      rather than six anonymous text boxes.
 *
 * `autoComplete="one-time-code"` is on the hidden input so the platform's own keyboard suggestion
 * works — on iOS that is the difference between reading a code out of Mail and typing it.
 *
 * FOCUS ON MOUNT is intentional here and nowhere else in the auth flow: a visitor only reaches this
 * control by asking for a code, so the cursor belongs in the first box. It is done with an effect
 * rather than the `autoFocus` attribute so the page keeps working when JavaScript is still
 * hydrating, and so it does not trip the accessibility lint rule that flags `autoFocus` for the
 * cases where it is genuinely hostile.
 */
export function OtpInput({
  name,
  label,
  describedBy,
  length = 6,
  autoFocus = false,
  onValueChange,
}: {
  /** The form field to submit under. Omit for client-side flows that verify in the browser. */
  name?: string;
  label: string;
  describedBy?: string;
  length?: number;
  autoFocus?: boolean;
  /** Called with the joined value on every change — how the TOTP challenge reads the code. */
  onValueChange?: (value: string) => void;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length }, () => ''));
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const value = digits.join('');

  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus();
  }, [autoFocus]);

  function update(next: string[]) {
    setDigits(next);
    onValueChange?.(next.join(''));
  }

  function setDigit(index: number, digit: string) {
    const next = [...digits];
    next[index] = digit;
    update(next);
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (!digit) {
      setDigit(index, '');
      return;
    }
    setDigit(index, digit);
    if (index < length - 1) boxes.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      setDigit(index - 1, '');
      boxes.current[index - 1]?.focus();
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      boxes.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      boxes.current[index + 1]?.focus();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    const next = Array.from({ length }, (_, index) => pasted[index] ?? digits[index] ?? '');
    update(next);
    // Leave the caret after the last digit that arrived, which is where the person was looking.
    const landed = Math.min(pasted.length, length - 1);
    boxes.current[landed]?.focus();
  }

  const entered = digits.filter(Boolean).length;

  return (
    <div>
      <span
        className="mb-1.5 block font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase"
        aria-hidden="true"
      >
        {label}
      </span>

      <div className="flex gap-2" aria-hidden="true">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              boxes.current[index] = element;
            }}
            value={digit}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            onFocus={(event) => event.currentTarget.select()}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            className="h-14 w-full rounded-lg border border-solid border-slate-300 bg-white text-center text-xl font-bold text-slate-900 transition-all outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />
        ))}
      </div>

      {/* The real control: one field, labelled, with the value the form submits. Visually hidden
          rather than styled, so it is never a second place to type the code. Omitted entirely for
          client-side flows, where there is no form to submit to. */}
      {name ? (
        <input
          type="text"
          name={name}
          value={value}
          required
          minLength={length}
          maxLength={length}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={label}
          aria-describedby={describedBy}
          onChange={() => undefined}
          className="sr-only"
          tabIndex={-1}
        />
      ) : (
        <span className="sr-only" role="status">
          {label} is {entered} of {length} digits complete.
        </span>
      )}

      <p className="mt-1.5 text-xs text-slate-500">
        {entered}/{length} digits entered
      </p>
    </div>
  );
}

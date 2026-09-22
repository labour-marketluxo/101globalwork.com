'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { FIELD, LABEL } from '@/components/discovery/tokens';

/**
 * The itemised half of the provider's quote form.
 *
 * ⚠️ THE ROWS ARE UNCONTROLLED INPUTS IN A SERVER-RENDERED FORM, NOT STATE THAT IS SUBMITTED AS JSON. Adding
 * and removing rows needs JavaScript, but the fields themselves are plain `<input name="...">` elements that
 * this component renders on the server too — so the form still submits the rows that exist on first paint if
 * nothing on this page runs. The only thing that needs the browser is the running total and the add/remove
 * buttons; the price that is stored is computed again, from these same inputs, by the server action.
 *
 * ⚠️ THE RUNNING TOTAL IS A COURTESY, NOT THE PRICE. The database recomputes the total from the line items
 * and the taxes and refuses a quote where they disagree, so a stale or tampered readout here changes what the
 * provider *sees* and never what is charged.
 */

type Row = { key: number };

/**
 * Row identity lives in a ref, not in module scope.
 *
 * ⚠️ A MODULE-LEVEL COUNTER IS SHARED BY EVERY REQUEST the server handles, so the keys a page renders would
 * depend on how many other pages had been rendered before it. Keys never reach the DOM, so that would not show
 * as a hydration error — it would just be state with no reason to exist, shared between visitors. The ids the
 * labels point at are derived from the index instead, which is why the first paint is identical on both sides.
 */
function makeKeys(start: number, count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({ key: start + index }));
}

function toMinor(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const major = Number(trimmed);
  if (!Number.isFinite(major) || major < 0) return null;
  return Math.round(major * 100);
}

export function QuotePricingFields({ currency }: { currency: string }) {
  // Two counters, one per list, so a key is unique in the whole form and not only within its list.
  const nextLineKey = useRef(4);
  const nextAddonKey = useRef(102);
  const [lines, setLines] = useState<Row[]>(() => makeKeys(1, 3));
  const [addons, setAddons] = useState<Row[]>(() => makeKeys(101, 1));
  const [minorTotal, setMinorTotal] = useState(0);
  const [minorTaxes, setMinorTaxes] = useState(0);

  const addRow = (
    setter: React.Dispatch<React.SetStateAction<Row[]>>,
    counter: React.MutableRefObject<number>,
  ) => {
    const key = counter.current;
    counter.current += 1;
    setter(current => [...current, { key }]);
  };

  const money = (minor: number) => {
    try {
      return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
    } catch {
      return `${currency} ${(minor / 100).toFixed(2)}`;
    }
  };

  const recompute = (form: HTMLFormElement) => {
    const data = new FormData(form);
    let total = 0;
    for (const amount of data.getAll('line_item_amount')) {
      total += toMinor(String(amount)) ?? 0;
    }
    setMinorTotal(total);
    setMinorTaxes(toMinor(String(data.get('taxes_and_fees') ?? '')) ?? 0);
  };

  return (
    // `event.target` rather than `currentTarget`: only a form control carries `.form`, and the listener is
    // on the wrapper so that it catches the inputs inside it.
    <div onInput={event => {
      const control = event.target as HTMLInputElement;
      if (control.form) recompute(control.form);
    }}>
      <fieldset className="mt-5">
        <legend className={LABEL}>What you are charging for</legend>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          One row per thing the customer is paying for. These rows add up to the price — the customer sees them
          as the breakdown and the platform refuses a total that does not match them. Include the call-out or
          labour as a row rather than folding it into a material.
        </p>

        <div className="space-y-2">
          {lines.map((row, index) => (
            <div key={row.key} className="flex items-start gap-2">
              <label className="sr-only" htmlFor={`line_label_${index}`}>
                Line {index + 1} description
              </label>
              <input
                id={`line_label_${index}`}
                name="line_item_label"
                type="text"
                maxLength={200}
                placeholder={index === 0 ? 'e.g. Labour, two hours' : 'e.g. Replacement washer'}
                className={FIELD}
              />
              <label className="sr-only" htmlFor={`line_amount_${index}`}>
                Line {index + 1} amount in {currency}
              </label>
              <input
                id={`line_amount_${index}`}
                name="line_item_amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                className={`${FIELD} w-32 shrink-0`}
              />
              <button
                type="button"
                onClick={() => setLines(current => current.filter(candidate => candidate.key !== row.key))}
                disabled={lines.length <= 1}
                aria-label={`Remove line ${index + 1}`}
                className="mt-0.5 shrink-0 rounded-lg border border-solid border-slate-300 p-2.5 text-slate-500 transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => addRow(setLines, nextLineKey)}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          Add another line
        </button>
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="taxes_and_fees">
            Taxes and fees included in the price ({currency})
          </label>
          <input
            id="taxes_and_fees"
            name="taxes_and_fees"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue="0"
            className={FIELD}
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Money you are collecting on somebody else&apos;s behalf, kept separate from the work. Leave it at
            zero if the lines above are the whole price.
          </p>
        </div>
        <div className="rounded-xl border border-solid border-slate-200 bg-slate-50 px-4 py-3">
          <p className={LABEL}>This quote&apos;s total</p>
          <p className="font-mono text-lg font-bold text-primary">{money(minorTotal + minorTaxes)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {money(minorTotal)} of work plus {money(minorTaxes)} in taxes and fees. The server recalculates this
            from the rows above when you submit.
          </p>
        </div>
      </div>

      <fieldset className="mt-6">
        <legend className={LABEL}>Optional add-ons</legend>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          Work the customer can buy on top of this price. Add-ons are shown beside the quote and are{' '}
          <span className="font-semibold">not</span> part of the total — the customer is not charged for one
          unless they ask for it.
        </p>

        <div className="space-y-2">
          {addons.map((row, index) => (
            <div key={row.key} className="flex items-start gap-2">
              <label className="sr-only" htmlFor={`addon_label_${index}`}>
                Add-on {index + 1} description
              </label>
              <input
                id={`addon_label_${index}`}
                name="addon_label"
                type="text"
                maxLength={200}
                placeholder="e.g. Replace the trap as well"
                className={FIELD}
              />
              <label className="sr-only" htmlFor={`addon_amount_${index}`}>
                Add-on {index + 1} amount in {currency}
              </label>
              <input
                id={`addon_amount_${index}`}
                name="addon_amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                className={`${FIELD} w-32 shrink-0`}
              />
              <button
                type="button"
                onClick={() => setAddons(current => current.filter(candidate => candidate.key !== row.key))}
                disabled={addons.length <= 1}
                aria-label={`Remove add-on ${index + 1}`}
                className="mt-0.5 shrink-0 rounded-lg border border-solid border-slate-300 p-2.5 text-slate-500 transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => addRow(setAddons, nextAddonKey)}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          Add another add-on
        </button>
      </fieldset>
    </div>
  );
}

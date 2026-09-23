'use client';

import { useRef } from 'react';
import { Copy } from 'lucide-react';
import { FIELD } from '@/components/discovery/tokens';
import { WEEKDAYS, WEEKDAY_LABELS, type OperatingHours } from '@/features/provider-workspace/hours';

/**
 * The weekly hours matrix.
 *
 * ⚠️ IT IS A CLIENT COMPONENT FOR ONE BUTTON, AND THAT BUTTON IS "COPY SCHEDULE TO ALL DAYS". Everything else is
 * an ordinary server-rendered input inside the form the server page owns: the matrix posts with the form, and with
 * JavaScript unavailable the copy button simply does not appear. That is the right trade — a provider finishing
 * their hours by hand is slower, not blocked.
 *
 * ⚠️ "COPY TO ALL DAYS" COPIES WHAT IS IN MONDAY'S ROW, AND SAYS SO. The brief asks for the action; the honest
 * version of it is "copy the day I have already filled in", not "guess my week". The provider can then adjust the
 * days that differ, which is how anybody actually fills one of these in.
 *
 * ⚠️ NO DAY IS A WORKING DAY BY DEFAULT. Every day starts empty and an empty day means closed; there is no
 * Monday-to-Friday assumption anywhere in this file or in the data behind it.
 */
export default function HoursMatrix({ hours }: { hours: OperatingHours }) {
  const formRef = useRef<HTMLDivElement>(null);

  const copyFirstDay = () => {
    const scope = formRef.current;
    if (!scope) return;
    const first = scope.querySelector<HTMLInputElement>('input[name="hours_mon_open"]');
    const firstClose = scope.querySelector<HTMLInputElement>('input[name="hours_mon_close"]');
    if (!first || !firstClose) return;
    for (const day of WEEKDAYS) {
      if (day === 'mon') continue;
      const open = scope.querySelector<HTMLInputElement>(`input[name="hours_${day}_open"]`);
      const close = scope.querySelector<HTMLInputElement>(`input[name="hours_${day}_close"]`);
      if (open) open.value = first.value;
      if (close) close.value = firstClose.value;
    }
  };

  return (
    <div ref={formRef} className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-relaxed text-slate-600">
          Leave both boxes blank for a day you do not work. Nothing here is a commitment — an agreed appointment is.
        </p>
        <button
          type="button"
          onClick={copyFirstDay}
          className="inline-flex items-center gap-1.5 rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
        >
          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
          Copy Monday to all days
        </button>
      </div>

      {WEEKDAYS.map(day => {
        const window = hours[day];
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
  );
}

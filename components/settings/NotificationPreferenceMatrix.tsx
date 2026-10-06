import Link from 'next/link';
import { CircleAlert, CircleCheck, Info, Lock } from '@/components/ui/icons';
import { CARD } from '@/components/discovery/tokens';
import { setNotificationPreferenceAction } from '@/features/settings/preference-actions';
import {
  CHANNELS,
  CHANNEL_COPY,
  type ChannelState,
  type NotificationChannel,
  type PreferenceEvent,
  type PreferencesRead,
} from '@/features/settings/notification-preferences';
import { CATEGORY_COPY, NOTIFICATION_CATEGORIES } from '@/features/notifications/copy';

/**
 * The channel and event matrix.
 *
 * ⚠️ ONE FORM PER CELL. A preferences screen with a single Save at the bottom cannot say which change was
 * refused, and the only change that CAN be refused — switching off a security, legal or dispute notice — is
 * the one where the reason matters most. Each cell posts its own new value and comes back with either the new
 * state or the reason it did not change.
 *
 * ⚠️ A REAL TABLE, BECAUSE IT IS A MATRIX. Rows are events and columns are channels, which is exactly what a
 * table means: a screen reader announces the column on every cell, so "Email, on" is never read without
 * saying which event it belongs to. On a narrow screen the table scrolls sideways inside its own container
 * rather than reflowing into something that is no longer the same shape.
 *
 * ⚠️ LOCKED CELLS ARE DISABLED AND SAID SO. Security, legal and payment-dispute notices come from the event
 * catalogue with `locked`, the command refuses to change them, and the page would rather show a padlock and
 * the reason than a control that fails on submit.
 *
 * ⚠️ PUSH AND SMS ARE TOGGLEABLE EVEN THOUGH NOTHING IS DELIVERED ON THEM YET. The preference is stored and
 * will apply the day a transport exists, so removing the control would make the matrix a lie in the other
 * direction. The column header carries the truth instead.
 */
export function PreferenceNotice({
  tone,
  children,
}: {
  tone: 'success' | 'warning';
  children: React.ReactNode;
}) {
  const isSuccess = tone === 'success';
  return (
    <div
      role={isSuccess ? 'status' : 'alert'}
      className={`flex items-start gap-3 rounded-xl border border-solid p-4 text-sm leading-relaxed ${
        isSuccess ? 'border-primary-subtle bg-primary-surface text-slate-700' : 'border-secondary bg-secondary-light text-amber-900'
      }`}
    >
      {isSuccess ? (
        <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      ) : (
        <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" />
      )}
      <div>{children}</div>
    </div>
  );
}

export function PreferenceUnavailable() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-solid border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-600">
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <div>
        <p className="font-semibold text-slate-900">Your notification settings could not be read.</p>
        <p className="mt-1">
          Nothing has been changed, and the matrix is not shown while the platform cannot tell you what your
          settings currently are — every row below would otherwise be a guess at what you already chose. Reload
          to try again.
        </p>
      </div>
    </div>
  );
}

export function PreferenceMatrix({ preferences }: { preferences: PreferencesRead }) {
  return (
    <div className={`${CARD} overflow-x-auto`}>
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <caption className="sr-only">
          Which events reach you, on which channel. Security, legal and payment-dispute notices are mandatory and
          cannot be switched off.
        </caption>
        <thead>
          <tr className="border-b border-solid border-slate-200">
            <th scope="col" className="px-4 py-3 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Event
            </th>
            {CHANNELS.map(channel => (
              <th
                key={channel}
                scope="col"
                className="w-28 px-3 py-3 text-center font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase"
              >
                {CHANNEL_COPY[channel].short}
                <span className="mt-1 block font-sans text-[10px] font-semibold tracking-normal normal-case">
                  {preferences.transport[channel] === 'available' ? (
                    <span className="text-slate-400">Delivers</span>
                  ) : (
                    <span className="text-amber-700">Nothing sent yet</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        {NOTIFICATION_CATEGORIES.map(category => {
          const events = preferences.events.filter(event => event.category === category);
          if (events.length === 0) return null;

          return (
            <tbody key={category} className="border-b border-solid border-slate-200 last:border-b-0">
              <tr>
                <th
                  scope="colgroup"
                  colSpan={CHANNELS.length + 1}
                  className="bg-slate-50 px-4 py-2.5 text-left"
                >
                  <span className="text-xs font-bold text-slate-800">{CATEGORY_COPY[category].label}</span>
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                    {CATEGORY_COPY[category].description}
                  </span>
                </th>
              </tr>
              {events.map(event => (
                <tr key={event.code} className="border-t border-solid border-slate-100 align-top">
                  <th scope="row" className="max-w-md px-4 py-3 text-left font-normal">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      {event.label}
                      {event.locked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-sans text-[10px] font-bold tracking-wide text-slate-600 uppercase">
                          <Lock aria-hidden="true" className="h-3 w-3" />
                          Mandatory
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                      {event.description}
                    </span>
                  </th>
                  {CHANNELS.map(channel => (
                    <td key={channel} className="px-3 py-3 text-center">
                      <ChannelCell event={event} channel={channel} state={event.channels[channel]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>

      <div className="border-t border-solid border-slate-200 px-4 py-3">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            <strong className="font-semibold text-slate-700">Email</strong> is delivered through the platform&rsquo;s
            own outbox, and{' '}
            <Link href="/notifications" className="underline underline-offset-2">
              delivery depends on that queue being published
            </Link>
            . <strong className="font-semibold text-slate-700">Push</strong> and{' '}
            <strong className="font-semibold text-slate-700">SMS</strong> have no transport configured in this
            deployment: the preferences are stored and will apply the day one exists, but today only email and
            in-app delivery reach you.
          </span>
        </p>
      </div>
    </div>
  );
}

function ChannelCell({
  event,
  channel,
  state,
}: {
  event: PreferenceEvent;
  channel: NotificationChannel;
  state: ChannelState;
}) {
  if (state.locked) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-sans text-[11px] font-bold tracking-wide text-slate-500 uppercase"
        title={`${event.label} on ${CHANNEL_COPY[channel].label} cannot be switched off.`}
      >
        <Lock aria-hidden="true" className="h-3 w-3" />
        Always on
        <span className="sr-only">
          {event.label} by {CHANNEL_COPY[channel].label} is always on and cannot be switched off.
        </span>
      </span>
    );
  }

  const next = !state.enabled;

  return (
    <form action={setNotificationPreferenceAction} className="inline-block">
      <input type="hidden" name="event_code" value={event.code} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="enabled" value={next ? 'true' : 'false'} />
      <button
        type="submit"
        role="switch"
        aria-checked={state.enabled}
        aria-label={`${event.label} by ${CHANNEL_COPY[channel].label}`}
        className={`inline-flex items-center gap-2 rounded-full border border-solid px-3 py-1 font-sans text-[11px] font-bold tracking-wide uppercase transition-colors ${
          state.enabled
            ? 'border-primary bg-primary-subtle text-primary hover:bg-primary hover:text-white'
            : 'border-slate-300 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-800'
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${state.enabled ? 'bg-primary' : 'bg-slate-300'}`}
        />
        {state.enabled ? 'On' : 'Off'}
      </button>
    </form>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CloudOff, Loader2, Navigation, Pause, Play, RefreshCw, Check, MapPin } from '@/components/ui/icons';
import {
  dequeue,
  enqueue,
  newQueueId,
  parseQueue,
  queueSnapshot,
  readQueue,
  subscribeConnectivity,
  subscribeStore,
  type QueuedActionInput,
  type QueuedAction,
} from '@/features/provider-workspace/offline';
import {
  openBlockerAction,
  recordFieldProgressAction,
  resolveBlockerAction,
  setTaskStepStateAction,
  startWorkAction,
} from '@/features/provider-workspace/actions';

/**
 * The field controls, and the queue that makes them survive a bad connection.
 *
 * ⚠️ EVERY CONTROL HERE IS STILL A SERVER-ACTION FORM. With JavaScript the submit is intercepted when the
 * device is offline so the action is queued instead; without JavaScript the form posts straight to the server,
 * which is the right failure — a provider with a dead bundle and a signal can still do the work.
 *
 * ⚠️ IDEMPOTENCE IS WHAT MAKES THE QUEUE SAFE, AND IT IS THE DATABASE'S, NOT THIS FILE'S. Field checkpoints
 * upsert, "start work" is confirmed against the authoritative state on replay, a blocker upserts onto the open
 * one, and a step is set to a NAMED state rather than toggled. So a queued action that arrives twice leaves the
 * job where the provider put it, and nothing here has to guess whether it already landed.
 */

async function replay(action: QueuedAction): Promise<void> {
  const data = new FormData();
  switch (action.kind) {
    case 'field':
      data.set('assignment_id', action.assignmentId);
      data.set('state', action.state);
      data.set('next', window.location.pathname);
      await recordFieldProgressAction(data);
      return;
    case 'start':
      data.set('assignment_id', action.assignmentId);
      data.set('next', window.location.pathname);
      await startWorkAction(data);
      return;
    case 'blocker':
      data.set('assignment_id', action.assignmentId);
      data.set('reason_code', action.reasonCode);
      data.set('note', action.note);
      data.set('next', window.location.pathname);
      await openBlockerAction(data);
      return;
    case 'step':
      data.set('step_id', action.stepId);
      data.set('state', action.state);
      data.set('next', window.location.pathname);
      await setTaskStepStateAction(data);
  }
}

/**
 * One flush at a time, across every instance of the queue on the page.
 *
 * ⚠️ MODULE SCOPE, NOT COMPONENT STATE, AND THERE IS USUALLY MORE THAN ONE INSTANCE. The sync indicator and the
 * status buttons each hold the queue, and both react to the same `online` event — without this, the same queued
 * action would be replayed twice at once. The writes are idempotent, so the damage would be nothing worse than a
 * duplicated request, but the guard is two lines and removes the question.
 */
let flushing = false;

function useWorkQueue() {
  /**
   * ⚠️ THE QUEUE AND THE CONNECTION STATE COME FROM `useSyncExternalStore`, NOT FROM AN EFFECT THAT SETS STATE.
   * Both are external stores — localStorage and the browser's connectivity — and an effect that copied them into
   * state would be a second copy that starts stale on every render, which this project's lint rules refuse for
   * good reason. The snapshot is the store; React subscribes and re-renders when it changes.
   */
  const rawQueue = useSyncExternalStore(subscribeStore, queueSnapshot, () => '');
  const queued = useMemo(() => parseQueue(rawQueue), [rawQueue]);
  const online = useSyncExternalStore(
    subscribeConnectivity,
    () => navigator.onLine,
    () => true,
  );
  const [syncing, setSyncing] = useState(false);
  const [justQueued, setJustQueued] = useState<string | null>(null);

  const flush = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (flushing) return;
    flushing = true;
    setSyncing(true);
    try {
      for (const action of readQueue()) {
        try {
          await replay(action);
          dequeue(action.id);
        } catch {
          // Leave it queued and stop: the connection is probably still bad, and the next press or the next
          // `online` event will try again. Dropping it here would lose a press the provider actually made.
          break;
        }
      }
    } finally {
      flushing = false;
      setSyncing(false);
    }
  }, []);

  /**
   * Coming back online flushes without being asked: the provider is walking away from the van, not watching a
   * status line.
   *
   * ⚠️ THE FLUSH IS DEFERRED BY A TICK RATHER THAN CALLED IN THE EFFECT BODY. `flush` sets its own state before
   * its first await, and calling it synchronously inside an effect is the cascading-render pattern the lint rules
   * reject. A timeout callback is outside the effect body, and it also lets the connection settle.
   */
  useEffect(() => {
    if (!online || queued.length === 0) return;
    const timer = window.setTimeout(() => {
      void flush();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [online, queued.length, flush]);

  const queueOrRun = useCallback(
    (action: QueuedActionInput, event: React.FormEvent<HTMLFormElement>) => {
      if (navigator.onLine) return; // let the form post normally
      event.preventDefault();
      const entry = { ...action, id: newQueueId(), queuedAt: new Date().toISOString() } as QueuedAction;
      enqueue(entry);
      setJustQueued(entry.label);
    },
    [],
  );

  return { online, queued, syncing, justQueued, flush, queueOrRun };
}

export function OfflineSyncStatus() {
  const { online, queued, syncing, flush } = useWorkQueue();

  return (
    <section
      aria-live="polite"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-solid p-3.5 text-xs ${
        queued.length > 0 ? 'border-secondary bg-secondary-light text-amber-900' : 'border-slate-200 bg-white text-slate-600'
      }`}
    >
      <p className="flex items-center gap-2">
        {queued.length > 0 ? (
          <CloudOff aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-800" />
        ) : (
          <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        )}
        <span>
          {queued.length === 0
            ? online
              ? 'Online. Nothing is waiting to be sent.'
              : 'Offline. Your next action is saved on this device and sent when the signal returns.'
            : `${queued.length} action${queued.length === 1 ? '' : 's'} saved on this device${
                online ? ', sending now' : ' — they will send when you are back online'
              }.`}
        </span>
      </p>
      {queued.length > 0 ? (
        <button
          type="button"
          onClick={() => void flush()}
          disabled={syncing || !online}
          className="inline-flex items-center gap-1.5 rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {syncing ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
          Send now
        </button>
      ) : null}
    </section>
  );
}

export function WorkStatusActions({
  assignmentId,
  requestState,
  fieldState,
  startAllowed,
  blocked,
  nextPath,
}: {
  assignmentId: string;
  requestState: string;
  fieldState: string | null;
  startAllowed: boolean;
  blocked: boolean;
  nextPath: string;
}) {
  const { queueOrRun, justQueued } = useWorkQueue();

  const checkpoints = useMemo(
    () =>
      [
        { state: 'en_route' as const, label: 'Mark on my way', icon: Navigation, done: fieldState === 'en_route' },
        { state: 'on_site' as const, label: 'Mark arrived at site', icon: MapPin, done: fieldState === 'on_site' },
      ].filter(checkpoint => checkpoint.state !== fieldState),
    [fieldState],
  );

  const canStart = requestState === 'scheduled' && startAllowed;

  return (
    <section className="grid gap-3" aria-labelledby="progression-heading">
      <h2 id="progression-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Progress this job
      </h2>

      {justQueued ? (
        <p role="status" className="rounded-xl border border-solid border-secondary bg-secondary-light p-3 text-xs leading-relaxed text-amber-900">
          “{justQueued}” is saved on this device. It will be sent as soon as the phone has a connection — the job
          has not changed yet.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {checkpoints.map(checkpoint => {
          const Icon = checkpoint.icon;
          return (
            <form
              key={checkpoint.state}
              action={recordFieldProgressAction}
              onSubmit={event =>
                queueOrRun(
                  { kind: 'field', assignmentId, state: checkpoint.state, label: checkpoint.label },
                  event,
                )
              }
            >
              <input type="hidden" name="assignment_id" value={assignmentId} />
              <input type="hidden" name="state" value={checkpoint.state} />
              <input type="hidden" name="next" value={nextPath} />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {checkpoint.label}
              </button>
            </form>
          );
        })}

        {canStart ? (
          <form
            action={startWorkAction}
            onSubmit={event => queueOrRun({ kind: 'start', assignmentId, label: 'Start work' }, event)}
          >
            <input type="hidden" name="assignment_id" value={assignmentId} />
            <input type="hidden" name="next" value={nextPath} />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark"
            >
              <Play aria-hidden="true" className="h-4 w-4" />
              Start work
            </button>
          </form>
        ) : null}

        {requestState === 'in_progress' && !blocked ? (
          <a
            href="#blocker"
            className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 no-underline transition-colors hover:border-primary hover:text-primary"
          >
            <Pause aria-hidden="true" className="h-4 w-4" />
            Pause / blocked
          </a>
        ) : null}

        {requestState === 'in_progress' ? (
          <a
            href={`${nextPath}/evidence`}
            className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white no-underline shadow-sm transition-colors hover:bg-secondary-dark"
          >
            Capture evidence
          </a>
        ) : null}
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        {requestState === 'accepted'
          ? 'Work cannot start until a time is agreed with the customer.'
          : requestState === 'scheduled' && !startAllowed
            ? 'Start is locked until the customer’s payment is funded. You can still schedule and travel.'
            : 'On my way and arrived are your own checkpoints — they do not change the job. Starting work and submitting for completion do.'}
      </p>
    </section>
  );
}

export function TaskStepControls({
  assignmentId,
  stepId,
  state,
  nextPath,
}: {
  assignmentId: string;
  stepId: string;
  state: 'todo' | 'doing' | 'done';
  nextPath: string;
}) {
  const { queueOrRun } = useWorkQueue();
  const next = state === 'done' ? 'todo' : 'done';
  const label = state === 'done' ? 'Untick this step' : 'Mark this step done';

  return (
    <form
      action={setTaskStepStateAction}
      onSubmit={event => queueOrRun({ kind: 'step', assignmentId, stepId, state: next, label }, event)}
    >
      <input type="hidden" name="step_id" value={stepId} />
      <input type="hidden" name="state" value={next} />
      <input type="hidden" name="next" value={nextPath} />
      <button
        type="submit"
        className={`inline-flex items-center gap-1.5 rounded-lg border border-solid px-3 py-1.5 text-xs font-semibold transition-colors ${
          state === 'done'
            ? 'border-slate-300 bg-white text-slate-500 hover:border-slate-400'
            : 'border-primary-subtle bg-primary-surface text-primary hover:border-primary'
        }`}
      >
        <Check aria-hidden="true" className="h-3.5 w-3.5" />
        {state === 'done' ? 'Undo' : 'Done'}
      </button>
    </form>
  );
}

export function BlockerControls({
  assignmentId,
  blockerId,
  blocked,
  nextPath,
}: {
  assignmentId: string;
  blockerId: string | null;
  blocked: boolean;
  nextPath: string;
}) {
  const { queueOrRun } = useWorkQueue();

  if (blocked && blockerId) {
    return (
      <form action={resolveBlockerAction} className="mt-3 grid gap-2">
        <input type="hidden" name="blocker_id" value={blockerId} />
        <input type="hidden" name="next" value={nextPath} />
        <label htmlFor="resolve_note" className="text-xs leading-relaxed text-slate-600">
          Say what changed, so the record explains itself later.
        </label>
        <input
          id="resolve_note"
          name="note"
          maxLength={500}
          placeholder="e.g. The customer left the gate key with the neighbour."
          className="w-full rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
        />
        <div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark"
          >
            Resume this job
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      id="blocker"
      action={openBlockerAction}
      className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={event => {
        const data = new FormData(event.currentTarget);
        queueOrRun(
          {
            kind: 'blocker',
            assignmentId,
            reasonCode: String(data.get('reason_code') ?? 'other'),
            note: String(data.get('note') ?? ''),
            label: 'Pause this job',
          },
          event,
        );
      }}
    >
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <input type="hidden" name="next" value={nextPath} />
      <div>
        <label htmlFor="reason_code" className="mb-1.5 block font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          Pause / blocked — why
        </label>
        <select
          id="reason_code"
          name="reason_code"
          required
          defaultValue=""
          className="w-full rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500"
        >
          <option value="" disabled>
            Choose a reason
          </option>
          <option value="no_access">No access to the site</option>
          <option value="missing_material">Waiting on a material or part</option>
          <option value="unsafe_conditions">The site is not safe to work in</option>
          <option value="customer_unavailable">The customer was not available</option>
          <option value="scope_unclear">The scope needs clarifying</option>
          <option value="weather">Weather</option>
          <option value="other">Something else</option>
        </select>
      </div>
      <div>
        <label htmlFor="blocker_note" className="mb-1.5 block font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          Anything to add (optional)
        </label>
        <input
          id="blocker_note"
          name="note"
          maxLength={500}
          className="w-full rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500"
        />
      </div>
      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
      >
        <Pause aria-hidden="true" className="h-4 w-4" />
        Pause
      </button>
    </form>
  );
}

/**
 * The offline queue for field actions.
 *
 * ⚠️ WHAT IS ACTUALLY QUEUED HERE. Four actions: the two field checkpoints ("on my way", "arrived"), starting
 * work, opening a blocker, and ticking a checklist step. They are small, they are the ones a provider presses
 * standing in front of a locked gate with one bar of signal, and every one of them is either an upsert or a
 * state the caller names explicitly — which is what makes replaying them safe.
 *
 * ⚠️ WHAT IS NOT QUEUED. Evidence files. Their bytes go to storage as soon as they are chosen, one at a time,
 * and the PATHS are what survive a reload (see `rememberUploadedFile`). Queueing file bytes in a browser would
 * mean IndexedDB blobs and a second upload implementation; uploading immediately and remembering the paths gets
 * the same outcome for the failure that matters — losing signal halfway through a package — with one code path.
 *
 * ⚠️ NOTHING HERE CALLS THE NETWORK OR IMPORTS THE SERVER CLIENT. It is localStorage and types, so a client
 * component can use it. The replay lives in the component, because that is where the server actions are.
 */

export type QueuedAction =
  | {
      id: string;
      kind: 'field';
      queuedAt: string;
      assignmentId: string;
      state: 'en_route' | 'on_site';
      label: string;
    }
  | { id: string; kind: 'start'; queuedAt: string; assignmentId: string; label: string }
  | {
      id: string;
      kind: 'blocker';
      queuedAt: string;
      assignmentId: string;
      reasonCode: string;
      note: string;
      label: string;
    }
  | {
      id: string;
      kind: 'step';
      queuedAt: string;
      assignmentId: string;
      stepId: string;
      state: 'todo' | 'doing' | 'done';
      label: string;
    };

/**
 * A queue entry before it has an id and a timestamp.
 *
 * ⚠️ THE DISTRIBUTION MATTERS. `Omit<QueuedAction, 'id' | 'queuedAt'>` collapses a union into the properties its
 * members have in common — which here is only `kind` — so the caller's `state`, `stepId` and `reasonCode` would
 * all be rejected. This conditional form applies the omission to each member separately.
 */
export type QueuedActionInput = QueuedAction extends infer Action
  ? Action extends QueuedAction
    ? Omit<Action, 'id' | 'queuedAt'>
    : never
  : never;

const QUEUE_KEY = 'provider-work-queue-v1';
const UPLOAD_KEY = 'provider-work-uploads-v1';

/**
 * The event that tells every listener the stored state changed.
 *
 * ⚠️ localStorage DOES NOT NOTIFY THE TAB THAT WROTE IT. The `storage` event fires in OTHER tabs only, so a write
 * here would leave this tab's subscription stale — and the components that read this store would keep showing a
 * queue that has already been flushed. Dispatching our own event covers the same tab; watching `storage` covers
 * the others.
 */
const STORE_EVENT = 'provider-work-store-changed';

function notify(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(STORE_EVENT));
}

/**
 * Subscribe to the stored queue and upload book.
 *
 * ⚠️ THIS EXISTS SO COMPONENTS CAN READ THE STORE WITHOUT CALLING setState INSIDE AN EFFECT, which this project's
 * React Compiler lint rules refuse — and which is the right call: state derived from an external store belongs in
 * `useSyncExternalStore`, where the snapshot and the re-render are guaranteed to agree.
 */
export function subscribeStore(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener(STORE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(STORE_EVENT, callback);
  };
}

/** The raw queue string, for `useSyncExternalStore`. Strings compare by value, so it is a stable snapshot. */
export function queueSnapshot(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(QUEUE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function uploadsSnapshot(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(UPLOAD_KEY) ?? '';
  } catch {
    return '';
  }
}

export function parseQueue(raw: string): QueuedAction[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedAction[]) : [];
  } catch {
    // A corrupt entry must not stop somebody working: an unreadable queue is treated as an empty one, and the
    // action they just pressed is offered again rather than silently dropped from a screen full of buttons.
    return [];
  }
}

export function parseUploads(raw: string): Record<string, UploadedFile[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, UploadedFile[]>) : {};
  } catch {
    return {};
  }
}

/** Subscribe to connectivity. `useSyncExternalStore` again, for the same reason as the queue. */
export function subscribeConnectivity(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function available(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function newQueueId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `q-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function readQueue(): QueuedAction[] {
  return parseQueue(queueSnapshot());
}

function writeQueue(items: QueuedAction[]): void {
  if (!available()) return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Storage can be full or blocked (private mode). The action still ran if the caller had a connection; if
    // it did not, the next attempt queues again.
  }
  notify();
}

export function enqueue(action: QueuedAction): QueuedAction[] {
  const items = [...readQueue(), action];
  writeQueue(items);
  return items;
}

export function dequeue(id: string): QueuedAction[] {
  const items = readQueue().filter(item => item.id !== id);
  writeQueue(items);
  return items;
}

// ── Uploaded files ────────────────────────────────────────────────────────────────────────────

export type UploadedFile = { path: string; name: string; size: number; contentType: string };

type UploadBook = Record<string, UploadedFile[]>;

function readUploads(): UploadBook {
  return parseUploads(uploadsSnapshot());
}

/**
 * Remember a file that is already in storage.
 *
 * ⚠️ THIS IS THE RESUMPTION. The bytes are in a private bucket and the path is the only thing the submission
 * needs, so a provider who loses signal, closes the browser and comes back finds their package half-built
 * rather than empty — which is the failure mode that actually costs a second site visit.
 */
export function rememberUploadedFile(assignmentId: string, file: UploadedFile): UploadedFile[] {
  const book = readUploads();
  const existing = book[assignmentId] ?? [];
  const next = [...existing.filter(item => item.path !== file.path), file];
  book[assignmentId] = next;
  if (available()) {
    try {
      window.localStorage.setItem(UPLOAD_KEY, JSON.stringify(book));
    } catch {
      // See writeQueue: a full store is not worth failing an upload that already succeeded.
    }
  }
  notify();
  return next;
}

export function readUploadedFiles(assignmentId: string): UploadedFile[] {
  return readUploads()[assignmentId] ?? [];
}

export function clearUploadedFiles(assignmentId: string): void {
  const book = readUploads();
  delete book[assignmentId];
  if (available()) {
    try {
      window.localStorage.setItem(UPLOAD_KEY, JSON.stringify(book));
    } catch {
      /* see above */
    }
  }
  notify();
}

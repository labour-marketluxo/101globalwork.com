'use client';

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Camera, Check, CloudOff, Image as ImageIcon, Loader2, RefreshCw, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { submitEvidencePackageAction } from '@/features/provider-workspace/actions';
import {
  clearUploadedFiles,
  newQueueId,
  parseUploads,
  rememberUploadedFile,
  subscribeConnectivity,
  subscribeStore,
  uploadsSnapshot,
  type UploadedFile,
} from '@/features/provider-workspace/offline';

/**
 * Evidence capture: photographs, video and documents, from a phone, on a bad connection.
 *
 * ⚠️ FILES GO TO STORAGE AS THEY ARE CHOSEN, NOT WHEN THE PACKAGE IS SENT. One file at a time, each with its own
 * outcome, and the PATH is remembered on the device. That is what "resumable" has to mean in this stack:
 * Supabase Storage has no byte-range resume without a TUS client this project does not depend on, so the
 * resilience comes from uploading early and remembering what landed. A provider who loses signal after three of
 * six photographs comes back to three, not to nothing.
 *
 * ⚠️ THE IMAGE IS COMPRESSED BEFORE IT LEAVES THE PHONE. A modern phone camera is 4–8MB per frame and the
 * question being answered is "was the work done", not "is this printable". Images are re-encoded to a maximum
 * edge of 1600px as JPEG at 0.8 — usually 10–20% of the original — and the compression is skipped rather than
 * failed when the browser cannot do it (a HEIC the canvas cannot decode goes up untouched).
 *
 * ⚠️ WHAT THE BUCKET WILL ACCEPT IS SAID UP FRONT. 10MB per file, images, video and PDF, twelve per package.
 * A file that fails is marked with the reason, not silently dropped.
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 12;
const MAX_EDGE = 1600;
const ALLOWED_PREFIXES = ['image/', 'video/mp4', 'application/pdf'];

type Item = {
  /** Stable across re-renders and used as the React key. */
  key: string;
  file: File;
  name: string;
  size: number;
  type: string;
  previewUrl: string | null;
  status: 'waiting' | 'compressing' | 'uploading' | 'uploaded' | 'failed';
  path: string | null;
  error: string | null;
};

function extensionOf(name: string, type: string): string {
  const fromName = name.includes('.') ? name.split('.').pop() ?? '' : '';
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'video/mp4') return 'mp4';
  if (type === 'application/pdf') return 'pdf';
  return 'bin';
}

/**
 * Re-encode an image at a smaller size.
 *
 * Returns the original when anything at all goes wrong: a compression that fails must never be the reason a
 * provider cannot submit proof of work.
 */
async function compressImage(file: File): Promise<{ blob: Blob; name: string; type: string; saved: number }> {
  const original = { blob: file as Blob, name: file.name, type: file.type, saved: 0 };
  if (!file.type.startsWith('image/')) return original;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return original;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob || blob.size >= file.size) return original;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return { blob, name, type: 'image/jpeg', saved: file.size - blob.size };
  } catch {
    // HEIC on a browser without a decoder, or a canvas that refuses the taint: upload what was taken.
    return original;
  }
}

export default function EvidenceCapture({
  assignmentId,
  providerId,
  steps,
  requestState,
  nextPath,
}: {
  assignmentId: string;
  providerId: string;
  steps: { id: string; label: string }[];
  requestState: string;
  nextPath: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [packageStepId, setPackageStepId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const currentListRef = useRef<Item[]>([]);

  /**
   * ⚠️ WHAT THIS DEVICE ALREADY UPLOADED IS AN EXTERNAL STORE, NOT STATE SEEDED BY AN EFFECT. localStorage is the
   * source of truth, `useSyncExternalStore` reads it, and the server snapshot is empty — which is also what makes
   * the first client paint match the server's, on a page whose whole job is to hold a queue.
   */
  const rawUploads = useSyncExternalStore(subscribeStore, uploadsSnapshot, () => '');
  const saved: UploadedFile[] = useMemo(
    () => parseUploads(rawUploads)[assignmentId] ?? [],
    [rawUploads, assignmentId],
  );
  const online = useSyncExternalStore(
    subscribeConnectivity,
    () => navigator.onLine,
    () => true,
  );

  /**
   * ⚠️ THE QUEUE IS WRITTEN THROUGH ONE FUNCTION, AND THE REF IS SET AT THE SAME MOMENT THE STATE IS.
   *
   * The uploader needs the current list after an `await`, and a `useEffect` that mirrors the state into a ref runs
   * a render too late: a file chosen while another was uploading would sit in state but not in the ref, and the
   * sequential uploader would walk past it. Writing both together removes the window entirely — the ref is never
   * a stale copy, it is the same value.
   */
  const setList = useCallback((updater: (current: Item[]) => Item[]) => {
    const next = updater(currentListRef.current);
    currentListRef.current = next;
    setItems(next);
  }, []);

  /**
   * The idempotency key, derived from what is being submitted.
   *
   * ⚠️ IT IS A FUNCTION OF THE PACKAGE, NOT A RANDOM NUMBER KEPT SOMEWHERE. Two attempts at the SAME package
   * produce the same key — so a retry after a timeout is deduplicated by the database rather than filing the
   * photographs twice — and a package with different files produces a different key, so a later submission is
   * not mistaken for the first one. Nothing has to be remembered or reset, which is one less thing to get wrong
   * on a phone.
   */
  const idempotencyKey = useMemo(() => {
    if (saved.length === 0) return '';
    return `pkg:${assignmentId}:${[...saved.map(file => file.path)].sort().join('|')}`;
  }, [assignmentId, saved]);

  /**
   * One file at a time: a phone on one bar of signal does not benefit from six parallel uploads.
   *
   * ⚠️ IT ALWAYS LOOKS FOR THE NEXT WAITING FILE RATHER THAN TAKING AN INDEX. An index captured before an `await`
   * describes a list that may already have changed, and the failure mode is silent — the file simply never
   * uploads. Scanning the current list for `waiting` is idempotent and self-correcting: retry clears the failed
   * ones back to `waiting` and the same scan picks them up.
   */
  const uploadNext = useCallback(
    async () => {
      if (uploading.current) return;
      const item = currentListRef.current.find(candidate => candidate.status === 'waiting');
      if (!item) return;
      uploading.current = true;
      try {
        setList(current => current.map(candidate => (candidate.key === item.key ? { ...candidate, status: 'compressing' } : candidate)));
        const compressed = await compressImage(item.file);
        setList(current => current.map(candidate => (candidate.key === item.key ? { ...candidate, status: 'uploading' } : candidate)));

        const supabase = createSupabaseBrowserClient();
        const path = `${providerId}/${assignmentId}/${newQueueId()}.${extensionOf(compressed.name, compressed.type)}`;
        const { error } = await supabase.storage
          .from('work-evidence')
          .upload(path, compressed.blob, { contentType: compressed.type, upsert: false });

        if (error) {
          setList(current =>
            current.map(candidate =>
              candidate.key === item.key
                ? { ...candidate, status: 'failed', error: error.message.slice(0, 160) }
                : candidate,
            ),
          );
          return;
        }

        const fileName = compressed.saved > 0 ? compressed.name : item.name;
        setList(current =>
          current.map(candidate =>
            candidate.key === item.key
              ? {
                  ...candidate,
                  status: 'uploaded',
                  path,
                  name: fileName,
                  size: compressed.blob.size,
                  type: compressed.type,
                  error: null,
                }
              : candidate,
          ),
        );
        // The book in storage is the source of truth; the component re-renders from the subscription above.
        rememberUploadedFile(assignmentId, {
          path,
          name: fileName,
          size: compressed.blob.size,
          contentType: compressed.type,
        });
      } finally {
        uploading.current = false;
        // Anything still waiting — a file added during this upload, or one retried a moment ago — goes next.
        void uploadNext();
      }
    },
    [assignmentId, providerId, setList],
  );

  const onSelect = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const incoming: Item[] = [];
      const rejected: string[] = [];

      for (const file of Array.from(fileList)) {
        const allowed = ALLOWED_PREFIXES.some(prefix => file.type.startsWith(prefix));
        if (!allowed) {
          rejected.push(`${file.name}: the bucket accepts images, MP4 video and PDF only`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          rejected.push(`${file.name}: ${(file.size / 1024 / 1024).toFixed(1)}MB is over the 10MB limit per file`);
          continue;
        }
        incoming.push({
          key: newQueueId(),
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
          status: 'waiting',
          path: null,
          error: null,
        });
      }

      const room = Math.max(0, MAX_FILES - items.length);
      if (incoming.length > room) {
        rejected.push(`only ${room} more file${room === 1 ? '' : 's'} fit in a package of ${MAX_FILES}`);
      }

      const accepted = incoming.slice(0, room);
      setNotice(rejected.length > 0 ? rejected.join('. ') : null);
      if (accepted.length > 0) {
        setList(current => [...current, ...accepted]);
        void uploadNext();
      }
      if (inputRef.current) inputRef.current.value = '';
    },
    [items.length, setList, uploadNext],
  );

  const retryFailed = useCallback(() => {
    setList(current =>
      current.map(item => (item.status === 'failed' ? { ...item, status: 'waiting' as const, error: null } : item)),
    );
    void uploadNext();
  }, [setList, uploadNext]);

  const uploaded = items.filter(item => item.status === 'uploaded');
  const failed = items.filter(item => item.status === 'failed');
  const totalBytes = uploaded.reduce((sum, item) => sum + item.size, 0);
  const canSubmit = saved.length > 0 && requestState === 'in_progress' && online;

  /**
   * The submission is a form post, not a fetch, so it works the way every other write in this app does: a
   * redirect back with a notice, and a `use server` action on the other side. The paths travel as repeated
   * fields, and the idempotency key is the one this device generated for this package.
   */
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Add proof of work</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Photographs are resized on the phone before they are sent. Each file uploads on its own, so losing
              signal halfway through a package does not undo the ones that already landed.
            </p>
          </div>
          <p className={`inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wide uppercase ${online ? 'text-slate-500' : 'text-amber-800'}`}>
            {online ? <CloudOff aria-hidden="true" className="h-3.5 w-3.5 opacity-0" /> : <CloudOff aria-hidden="true" className="h-3.5 w-3.5" />}
            {online ? 'Online' : 'Offline'}
          </p>
        </div>

        <input
          ref={inputRef}
          id="evidence_files"
          type="file"
          accept="image/*,video/mp4,application/pdf"
          capture="environment"
          multiple
          onChange={event => onSelect(event.target.files)}
          className="block w-full cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:font-mono file:text-xs file:font-bold file:tracking-wide file:text-white file:uppercase"
        />
        <p className="text-xs leading-relaxed text-slate-500">
          Up to {MAX_FILES} files per package, 10MB each, images, MP4 video or PDF. Photographs taken straight
          from the camera are compressed to a {MAX_EDGE}px edge before upload.
        </p>

        {notice ? (
          <p role="alert" className="rounded-xl border border-solid border-secondary bg-secondary-light p-3 text-xs leading-relaxed text-amber-900">
            {notice}
          </p>
        ) : null}
      </section>

      {items.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="queue-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="queue-heading" className="text-sm font-bold tracking-tight text-slate-900">
              This session&apos;s queue
            </h2>
            {failed.length > 0 ? (
              <button
                type="button"
                onClick={retryFailed}
                className="inline-flex items-center gap-1.5 rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
              >
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                Retry {failed.length} failed upload{failed.length === 1 ? '' : 's'}
              </button>
            ) : null}
          </div>

          <ul className="grid gap-2">
            {items.map(item => (
              <li key={item.key} className="flex items-start gap-3 rounded-xl border border-solid border-slate-200 bg-white p-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">
                  {item.previewUrl ? (
                    // A captured thumbnail: the provider recognises the photograph they took, which is the
                    // fastest way to catch a shot of their own thumb before it is submitted.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.previewUrl} alt="" className="h-12 w-12 object-cover" />
                  ) : item.type === 'application/pdf' ? (
                    <span className="font-mono text-[10px] font-bold">PDF</span>
                  ) : (
                    <Camera aria-hidden="true" className="h-4 w-4" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800">{item.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {(item.size / 1024).toFixed(0)} KB ·{' '}
                    {item.status === 'uploaded'
                      ? 'in private storage'
                      : item.status === 'failed'
                        ? item.error ?? 'upload failed'
                        : item.status === 'waiting'
                          ? 'waiting to upload'
                          : 'uploading…'}
                  </p>

                </div>

                <span className="shrink-0">
                  {item.status === 'uploaded' ? (
                    <Check aria-hidden="true" className="h-4 w-4 text-primary" />
                  ) : item.status === 'failed' ? (
                    <TriangleAlert aria-hidden="true" className="h-4 w-4 text-amber-700" />
                  ) : (
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-slate-400 motion-reduce:animate-none" />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-3 rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          <ImageIcon aria-hidden="true" className="h-4 w-4 text-primary" />
          Saved on this device
        </h2>
        <p className="text-xs leading-relaxed text-slate-600">
          {saved.length === 0
            ? 'Nothing has been uploaded for this job from this device yet.'
            : `${saved.length} file${saved.length === 1 ? '' : 's'} already in private storage (${(totalBytes / 1024 / 1024).toFixed(1)}MB this session). The paths are kept on the phone, so coming back later does not mean uploading them again.`}
        </p>
        {saved.length > 0 ? (
          <ul className="grid gap-1 text-xs text-slate-600">
            {saved.map(file => (
              <li key={file.path} className="flex items-center justify-between gap-3">
                <span className="truncate">{file.name}</span>
                <span className="font-mono text-slate-400">{(file.size / 1024).toFixed(0)} KB</span>
              </li>
            ))}
          </ul>
        ) : null}
        {saved.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              clearUploadedFiles(assignmentId);
            }}
            className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            Forget this device&apos;s list
          </button>
        ) : null}
        <p className="text-xs leading-relaxed text-slate-500">
          Forgetting the list does not delete anything from storage — it only clears what this phone remembers.
        </p>
      </section>

      <form action={submitEvidencePackageAction} className="grid gap-3 rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-sm">
        <input type="hidden" name="assignment_id" value={assignmentId} />
        <input type="hidden" name="next" value={`${nextPath}/evidence`} />
        <input
          type="hidden"
          name="kind"
          // Derived from what is actually being submitted, including files uploaded in an earlier session —
          // `evidence_kind` is a label on the row the customer reads, so a package of photographs and a PDF should
          // not be filed as "photo" because only the photographs were chosen in this sitting.
          value={saved.some(file => !file.contentType.startsWith('image/')) ? 'document' : 'photo'}
        />
        <input type="hidden" name="idempotency_key" value={idempotencyKey} />
        {saved.map(file => (
          <input key={file.path} type="hidden" name="storage_paths" value={file.path} />
        ))}

        {steps.length > 0 ? (
          <div>
            <label htmlFor="package_step" className="mb-1.5 block font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Which checklist step does this package answer?
            </label>
            <select
              id="package_step"
              name="task_step_id"
              value={packageStepId}
              onChange={event => setPackageStepId(event.target.value)}
              className="w-full rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500"
            >
              <option value="">The job as a whole</option>
              {steps.map(step => (
                <option key={step.id} value={step.id}>
                  {step.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              One step per package, because that is the shape the record has: an evidence row is tied to a step or
              to the job. Send a second package for a second step.
            </p>
          </div>
        ) : null}

        <div>
          <label htmlFor="evidence_note" className="mb-1.5 block font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            What was completed
          </label>
          <textarea
            id="evidence_note"
            name="note"
            rows={4}
            maxLength={2000}
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder="Describe what was done and anything the customer should know before they approve it."
            className="w-full rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />
        </div>

        {requestState !== 'in_progress' ? (
          <p className="rounded-xl border border-solid border-secondary bg-secondary-light p-3 text-xs leading-relaxed text-amber-900">
            Evidence can only be submitted while the work is under way. Right now the job is “{requestState.replaceAll('_', ' ')}”, so
            uploading is still worth doing — the files and their paths are kept for when you start.
          </p>
        ) : null}

        {!online && saved.length > 0 ? (
          <p className="rounded-xl border border-solid border-secondary bg-secondary-light p-3 text-xs leading-relaxed text-amber-900">
            You are offline. Your uploads are saved on the device; submitting for sign-off needs a connection, and
            the button below will fail until one comes back.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            aria-busy={false}
            className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-6 py-3 font-mono text-sm font-bold tracking-wide text-white shadow-lg shadow-amber-950/20 transition-all hover:bg-secondary-dark active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload aria-hidden="true" className="h-4 w-4" />
            Submit evidence package
          </button>
          <p className="text-xs leading-relaxed text-slate-500">
            Submitting asks the customer to approve the work. It does not mark the job paid or finished on its own.
          </p>
        </div>
      </form>
    </div>
  );
}

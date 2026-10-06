'use client';

import { useRef, useState } from 'react';
import { Check, Loader2, Upload } from '@/components/ui/icons';
import { FIELD, LABEL } from '@/components/discovery/tokens';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { addProjectDocumentAction } from '@/features/projects/actions';
import { DOCUMENT_TYPE_COPY, ACCESS_SCOPE_COPY } from '@/features/projects/document-copy';

/**
 * Upload a document version.
 *
 * ⚠️ THE BYTES GO FIRST, THE RECORD SECOND. The file is put into the private bucket under
 * `<assignment_id>/documents/` — a prefix the storage policy allows only to participants — and its path is then
 * registered by a server action. A row that pointed at a file that was never uploaded would be a broken link on a
 * page about evidence, so the submit button stays disabled until the upload succeeds.
 *
 * ⚠️ NOTHING IS OVERWRITTEN. A new document is a new version; adding a version of an existing one picks the group
 * and the command numbers the row. There is no path here that edits or deletes a version, and no delete policy on
 * the objects either.
 */
export default function DocumentUploader({
  assignmentId,
  existingGroups,
}: {
  assignmentId: string;
  existingGroups: { id: string; title: string; latestVersion: number }[];
}) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ path: string; name: string; size: number; type: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onSelect = async (file: File | undefined) => {
    if (!file) return;
    setStatus('uploading');
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const extension = file.name.includes('.') ? (file.name.split('.').pop() ?? '').slice(0, 5).toLowerCase() : 'bin';
      const path = `${assignmentId}/documents/${crypto.randomUUID()}${extension ? `.${extension}` : ''}`;
      const { error: uploadError } = await supabase.storage
        .from('work-evidence')
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (uploadError) {
        setStatus('failed');
        setError(uploadError.message.slice(0, 160));
        return;
      }
      setUploaded({ path, name: file.name, size: file.size, type: file.type || 'application/octet-stream' });
      setStatus('uploaded');
    } catch (caught) {
      setStatus('failed');
      setError(caught instanceof Error ? caught.message.slice(0, 160) : 'The upload failed.');
    }
  };

  return (
    <form action={addProjectDocumentAction} className="grid gap-4 rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-sm">
      <input type="hidden" name="assignment_id" value={assignmentId} />
      {uploaded ? (
        <>
          <input type="hidden" name="storage_path" value={uploaded.path} />
          <input type="hidden" name="mime_type" value={uploaded.type} />
          <input type="hidden" name="size_bytes" value={String(uploaded.size)} />
        </>
      ) : null}

      <div>
        <h2 className="text-sm font-bold tracking-tight text-slate-900">Add a document or a new version</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          Pick a file first: it goes to private storage, and nothing is recorded until it is there. Choosing a file is
          not what publishes it — the form below is.
        </p>
      </div>

      <div>
        <label htmlFor="document_file" className={LABEL}>
          File
        </label>
        <input
          ref={inputRef}
          id="document_file"
          type="file"
          accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
          onChange={event => void onSelect(event.target.files?.[0])}
          className="block w-full cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:font-mono file:text-xs file:font-bold file:tracking-wide file:text-white file:uppercase"
        />
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
          {status === 'uploading' ? (
            <>
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              Uploading to private storage…
            </>
          ) : status === 'uploaded' && uploaded ? (
            <>
              <Check aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
              {uploaded.name} is in storage. Fill in the details and save it.
            </>
          ) : status === 'failed' ? (
            <span className="text-amber-800">The upload failed: {error} You can pick the file again.</span>
          ) : (
            'PDF, images and office documents. The platform stores what you give it and does not convert anything.'
          )}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="document_title" className={LABEL}>
            Title
          </label>
          <input id="document_title" name="title" required minLength={2} maxLength={200} className={FIELD} />
        </div>
        <div>
          <label htmlFor="document_type" className={LABEL}>
            Type
          </label>
          <select id="document_type" name="document_type" required defaultValue="other" className={FIELD}>
            {Object.entries(DOCUMENT_TYPE_COPY).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="document_group_id" className={LABEL}>
            New version of
          </label>
          <select id="document_group_id" name="document_group_id" defaultValue="" className={FIELD}>
            <option value="">A new document</option>
            {existingGroups.map(group => (
              <option key={group.id} value={group.id}>
                {group.title} (currently v{group.latestVersion})
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Choosing one adds this file as the next version. The earlier versions stay exactly as they were.
          </p>
        </div>
        <div>
          <label htmlFor="access_scope" className={LABEL}>
            Who may open it
          </label>
          <select id="access_scope" name="access_scope" defaultValue="participants" className={FIELD}>
            {Object.entries(ACCESS_SCOPE_COPY).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Enforced by the storage policy, not by this page: a provider-only document cannot be opened by the
            customer even with the link.
          </p>
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={status !== 'uploaded'}
          className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload aria-hidden="true" className="h-4 w-4" />
          Save this version
        </button>
        {status !== 'uploaded' ? (
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            The button unlocks once the file is in storage, so the record cannot point at something that is not there.
          </p>
        ) : null}
      </div>
    </form>
  );
}

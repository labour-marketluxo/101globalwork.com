'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ImageUp } from 'lucide-react';
import { LABEL } from '@/components/discovery/tokens';
import { uploadAvatarAction } from '@/features/settings/identity-actions';

/**
 * The avatar picker.
 *
 * THE ONLY CLIENT COMPONENT IN THE PROFILE EDITOR, and it is here for one reason: a picture chosen from a
 * disk needs to be shown back before it is uploaded. Without that, "choose a file" is a field somebody has
 * to submit to find out whether they picked the right one, and the failure mode — a two-megabyte photo of
 * the wrong thing now on their account — is not one they can undo by pressing Back.
 *
 * ⚠️ WHAT IS NOT CLIENT-SIDE: the upload itself, the type and size rules, and the decision about where the
 * object is allowed to live. The browser shows the preview; the server action re-checks everything and the
 * storage policy authorises it. A file picked through a hand-written POST is subject to exactly the same
 * rules as one picked here.
 *
 * ⚠️ THE OBJECT URL IS REVOKED. `createObjectURL` holds the whole file in memory until it is released, which
 * on a phone with a large photo is the difference between a form and a tab that has to be killed.
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-mono text-xs font-bold tracking-wide text-white uppercase transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
    >
      <ImageUp aria-hidden="true" className="h-4 w-4" />
      {pending ? 'Uploading…' : 'Save photo'}
    </button>
  );
}

export default function AvatarUploader({ hasAvatar }: { hasAvatar: boolean }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  return (
    <form action={uploadAvatarAction} className="grid gap-3">
      <label className={LABEL} htmlFor="avatar">
        {hasAvatar ? 'Replace your photo' : 'Add a photo'}
      </label>
      <input
        id="avatar"
        name="avatar"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={event => {
          const file = event.target.files?.[0] ?? null;
          setRejected(null);
          if (preview) URL.revokeObjectURL(preview);
          if (!file) {
            setPreview(null);
            setFileName(null);
            return;
          }
          // The same limits the server enforces, checked here so the answer arrives before a two-megabyte
          // upload rather than after it. The server is still the one that decides.
          if (file.size > 2 * 1024 * 1024) {
            setRejected('That image is larger than 2 MB. Choose a smaller one.');
            setPreview(null);
            setFileName(null);
            return;
          }
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            setRejected('That file is not a JPEG, PNG or WebP image.');
            setPreview(null);
            setFileName(null);
            return;
          }
          setPreview(URL.createObjectURL(file));
          setFileName(file.name);
        }}
        className="block w-full cursor-pointer rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
      />
      <p className="text-xs leading-relaxed text-slate-500">
        JPEG, PNG or WebP, up to 2 MB. It is stored privately: only you can fetch it, and it is served to your
        own session rather than from a public address.
      </p>

      {rejected ? (
        <p role="alert" className="text-xs font-semibold text-red-700">
          {rejected}
        </p>
      ) : null}

      {preview ? (
        <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
          <Image
            src={preview}
            alt="The photo you have chosen, before it is saved"
            width={48}
            height={48}
            unoptimized
            className="h-12 w-12 rounded-full object-cover"
          />
          <p className="min-w-0 text-xs text-slate-600">
            <span className="block truncate font-semibold text-slate-800">{fileName}</span>
            Nothing has been saved yet.
          </p>
        </div>
      ) : null}

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, FileWarning, Mic, Paperclip, Square } from '@/components/ui/icons';
import { FIELD, LABEL } from '@/components/discovery/tokens';
import { SAFETY_REMINDER } from '@/features/customer/intake';

/**
 * The intent box: type it, say it, or drop a file on it — with two honest refusals.
 *
 * ⚠️ IT SAYS NOTHING IS ATTACHED, AND THAT IS THE FEATURE. This platform has no storage bucket and no
 * `request_attachments` table, so a dropped file goes NOWHERE. A dropzone that showed a thumbnail would
 * be lying at exactly the moment the visitor believed they had handed something over. The files are
 * named and then labelled as not sent; the `<input type="file">` has no `name`, so even a later edit to
 * this copy could not accidentally make the browser submit one.
 *
 * ⚠️ VOICE INPUT IS THE BROWSER'S, NOT OURS. `SpeechRecognition` is a Chrome-family API, needs a secure
 * context, and in some browsers uploads the audio to a vendor's servers. The button is not rendered at
 * all when the constructor is missing — a control that does nothing when pressed is worse than no
 * control — and `continuous` is off so that one press means one sentence rather than a microphone that
 * stays open until someone notices.
 */

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const vendor = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return vendor.SpeechRecognition ?? vendor.webkitSpeechRecognition ?? null;
}

/** The browser's speech API is not a store with subscribers — it is a constant of the environment. */
const voiceCapability = {
  subscribe: () => () => {},
  getSnapshot: () => recognitionCtor() !== null,
  getServerSnapshot: () => false,
};

/**
 * Secrets in a box that is sent to strangers.
 *
 * The description is copied into every matched provider's view of the request, so the reminder is
 * worth restating as a warning the moment the text looks like it contains something that must never
 * travel that way. Deterministic and local: nothing is sent anywhere to work this out.
 */
const SENSITIVE_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\b\d{10}\b/, label: 'a ten-digit number, the shape of a bank account number' },
  { pattern: /\b(?:\d[ -]?){13,19}\b/, label: 'a long number, the shape of a card number' },
  { pattern: /\b(?:cvv|cvc)\b/i, label: 'a card security code' },
  { pattern: /\b(?:password|passcode|pass phrase|otp|one[- ]time code)\b/i, label: 'a password or one-time code' },
  { pattern: /\bpin\b/i, label: 'a PIN' },
];

function sensitiveHits(text: string): string[] {
  return SENSITIVE_PATTERNS.filter(entry => entry.pattern.test(text)).map(entry => entry.label);
}

export default function IntakeComposer({
  defaultValue,
  maxLength = 2000,
}: {
  defaultValue: string;
  maxLength?: number;
}) {
  const [text, setText] = useState(defaultValue);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  /**
   * Capability is read as an external store rather than set from an effect.
   *
   * `SpeechRecognition` does not exist on the server and never changes during a page's life, so there
   * is nothing to subscribe to — the server snapshot is `false`, the client snapshot is the real
   * answer, and React reconciles the two without an effect that renders twice to say the same thing.
   * Deciding during the first render would have produced a button that appears and then vanishes.
   */
  const voiceAvailable = useSyncExternalStore(
    voiceCapability.subscribe,
    voiceCapability.getSnapshot,
    voiceCapability.getServerSnapshot,
  );

  const recognition = useRef<RecognitionLike | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);

  // An effect that only stops an external system, which is what effects are for. It deliberately sets
  // no state: the microphone is closed on unmount and nothing about the page needs to know.
  useEffect(() => () => {
    recognition.current?.stop();
    recognition.current = null;
  }, []);

  const hits = useMemo(() => sensitiveHits(text), [text]);

  function appendTranscript(transcript: string) {
    const clean = transcript.trim();
    if (!clean) return;
    setText(current => {
      const joined = current.trim().length === 0 ? clean : `${current.trimEnd()} ${clean}`;
      return joined.slice(0, maxLength);
    });
  }

  function toggleListening() {
    if (listening) {
      recognition.current?.stop();
      return;
    }

    const Ctor = recognitionCtor();
    if (!Ctor) {
      setVoiceNote('This browser does not support speech input. Type the description instead.');
      return;
    }

    const instance = new Ctor();
    instance.lang = navigator.language || 'en-NG';
    instance.continuous = false;
    instance.interimResults = false;

    instance.onresult = event => {
      for (let i = 0; i < event.results.length; i += 1) {
        const alternative = event.results[i]?.[0];
        if (alternative?.transcript) appendTranscript(alternative.transcript);
      }
    };

    instance.onerror = event => {
      setListening(false);
      // `not-allowed` is the one worth naming: it is what a visitor sees when the page is not on a
      // secure origin, or when the microphone was dismissed. Both are recoverable and neither is
      // obvious from a silent button.
      setVoiceNote(
        event.error === 'not-allowed'
          ? 'The microphone was blocked. Voice input needs permission and a secure (https) connection — typing works either way.'
          : 'Speech input stopped before it caught anything. Try again, or type the description.',
      );
    };

    instance.onend = () => setListening(false);

    recognition.current = instance;
    setVoiceNote(null);
    setListening(true);

    try {
      instance.start();
    } catch {
      setListening(false);
      setVoiceNote('Speech input could not start in this tab. Type the description instead.');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className={LABEL} htmlFor="need_text">
          Describe the work in your own words
        </label>

        {/* Rendered only when the browser really has the API. The `hidden` attribute would not have
            worked here: preflight is not imported in this project, so the UA's `[hidden]{display:none}`
            is outranked by the `inline-flex` right here on the same element. */}
        {voiceAvailable ? (
          <button
            type="button"
            onClick={toggleListening}
            className={`inline-flex items-center gap-1.5 rounded-lg border border-solid px-2.5 py-1.5 font-sans text-[11px] font-bold tracking-wider uppercase transition-colors ${
              listening
                ? 'border-transparent bg-secondary text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:border-primary hover:text-primary'
            }`}
          >
            {listening ? (
              <Square aria-hidden="true" className="h-3.5 w-3.5" />
            ) : (
              <Mic aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            {listening ? 'Stop' : 'Speak'}
          </button>
        ) : null}
      </div>

      <textarea
        id="need_text"
        name="need_text"
        ref={textarea}
        required
        minLength={5}
        maxLength={maxLength}
        rows={5}
        value={text}
        onChange={event => setText(event.target.value)}
        aria-describedby="need_text_help need_text_privacy"
        className={FIELD}
        placeholder="e.g. The kitchen tap has been dripping for a week and the cupboard under it is damp. Ground floor flat, gate needs a code."
      />

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <p id="need_text_help" className="text-xs text-slate-500">
          A sentence or two is enough. Providers quote from this text, so what is wrong and where it is
          matter more than how well it is written.
        </p>
        <p className="font-sans text-[11px] text-slate-400">
          {text.length}/{maxLength}
        </p>
      </div>

      {listening ? (
        <p role="status" className="mt-2 text-xs font-semibold text-secondary-dark">
          Listening. Speak normally; what it hears is added to the box above, and you can edit it.
        </p>
      ) : null}

      {voiceNote ? (
        <p role="status" className="mt-2 text-xs text-slate-600">
          {voiceNote}
        </p>
      ) : null}

      {/* The privacy reminder is not decoration: this text is what every matched provider reads. */}
      <div
        id="need_text_privacy"
        className="mt-4 rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3"
      >
        <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">
          Before you type
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-primary-deep">{SAFETY_REMINDER}</p>
      </div>

      {hits.length > 0 ? (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            That description looks like it contains {hits.join(' and ')}. Nothing here needs it — remove
            it before continuing, because this text is shown to providers.
          </span>
        </p>
      ) : null}

      {/* ── The dropzone that refuses ─────────────────────────────────────────────────────────── */}
      <div
        onDragOver={event => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => {
          event.preventDefault();
          setDragging(false);
          setFileNames(Array.from(event.dataTransfer.files).map(file => file.name));
        }}
        className={`mt-4 rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
          dragging ? 'border-solid border-primary bg-primary-subtle' : 'border-slate-300 bg-slate-50'
        }`}
      >
        <Paperclip aria-hidden="true" className="mx-auto h-5 w-5 text-slate-400" />
        <p className="mt-2 text-sm font-semibold text-slate-700">
          Photos and documents
        </p>
        <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
          Nothing you drop here is attached. This platform has no file storage and no place to record an
          attachment against a request, so a file would go nowhere — dropping one below shows you exactly
          what this page did with it: kept the name, sent nothing.
        </p>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-3 py-2 font-sans text-[11px] font-bold tracking-wider text-slate-600 uppercase transition-colors hover:border-primary hover:text-primary">
          Choose a file
          {/* No `name`: with no name the browser cannot submit this input at all. */}
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={event => {
              setFileNames(Array.from(event.target.files ?? []).map(file => file.name));
              setDragging(false);
            }}
          />
        </label>

        {fileNames.length > 0 ? (
          <ul className="mx-auto mt-3 max-w-md space-y-1 text-left">
            {fileNames.map(name => (
              <li
                key={name}
                className="flex items-center gap-2 rounded-lg border border-solid border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600"
              >
                <FileWarning aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span className="truncate">{name}</span>
                <span className="ml-auto shrink-0 font-sans text-[10px] font-bold tracking-wider text-amber-700 uppercase">
                  not attached
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-2 text-xs text-slate-500">
          Describe in words what a photo would have shown — the make and model, the size, or what is
          leaking. Providers can ask for a picture once a match is made.
        </p>
      </div>
    </div>
  );
}

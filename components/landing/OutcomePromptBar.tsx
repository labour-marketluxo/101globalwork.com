'use client';

import { Mic, PencilLine, Sparkles, Square, TriangleAlert, Zap } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * OutcomePromptBar — the hero's prompt bar.
 *
 * Ported from the design's `#prompt-box`, which is the visual centre of the
 * page: a white card containing a segmented mode control, a large free-text
 * input, a reassurance line and a solid deep-teal action button.
 *
 * WHAT CHANGED FROM THE DESIGN, AND WHY
 *
 * 1. The design's submit button faked a result. Its JavaScript swapped the
 *    label to "Decomposing Milestones & Matching Crews…", waited 1.4s, then
 *    showed "Scope Generated (3 Milestones Matched)" and reset — none of which
 *    did anything. This is a real `<form method="get" action="/search">`, so the
 *    button navigates to the app's existing search contract
 *    (`/search?q=…`) and the wizard result is a normal, shareable URL.
 *
 * 2. "Upload Schematics" is gone. A GET form cannot submit file contents, and
 *    there is no storage plumbing behind it, so the tab could only ever
 *    pretend. Two modes remain: type, and speak.
 *
 * 3. Voice is real, via the Web Speech API, and the control is rendered ONLY
 *    when the browser exposes it. Server-rendered markup therefore never
 *    includes a microphone that cannot work, and the tab count matches what the
 *    browser can actually do.
 *
 * `lang` follows `navigator.language` rather than being pinned to en-US — this
 * is a global marketplace, and dictation that assumes a US locale would mis-hear
 * exactly the users least likely to tolerate it.
 */

type SpeechAlternative = { transcript: string };
type SpeechResult = { isFinal: boolean; 0: SpeechAlternative };
type SpeechEvent = {
  resultIndex: number;
  results: { [index: number]: SpeechResult; length: number };
};

/** The Web Speech API is not in TS's DOM lib, so the surface we use is typed here. */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Browser speech support cannot change while the page is open, so: no-op. */
const subscribeToNothing = () => () => {};

export default function OutcomePromptBar() {
  const [brief, setBrief] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);

  /**
   * Capability detection WITHOUT a setState-in-effect. The obvious
   * `useState(false)` + `useEffect(() => setSupported(...), [])` is rejected by
   * the lint config (`react-hooks/set-state-in-effect`) — correctly, since it
   * forces a cascading render on every mount.
   *
   * `useSyncExternalStore` is the right tool for reading a value that lives
   * outside React: the server snapshot is `false`, so the SSR markup and the
   * hydration pass agree, and the real answer arrives on the following render.
   */
  const voiceSupported = useSyncExternalStore(
    subscribeToNothing,
    () => getRecognitionCtor() !== null,
    () => false,
  );

  // A recogniser left running after navigation keeps the microphone open.
  useEffect(() => () => recognition.current?.stop(), []);

  const stopListening = () => {
    recognition.current?.stop();
    setListening(false);
  };

  const startListening = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    setVoiceError(null);

    const instance = new Ctor();
    instance.lang = navigator.language || 'en-US';
    instance.continuous = true;
    instance.interimResults = true;

    instance.onresult = (event) => {
      // Only FINAL results are committed to the brief. Interim results rewrite
      // themselves as the sentence is revised, so appending them would bake in
      // half-recognised words.
      let committed = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) committed += result[0].transcript;
      }
      if (committed.trim()) {
        setBrief((previous) => `${previous} ${committed.trim()}`.trim());
      }
    };

    instance.onend = () => setListening(false);

    /**
     * Failures are SHOWN. A recogniser that refuses to start otherwise looks
     * exactly like a dead button: the label flips back and nothing explains
     * why. `no-speech` and `aborted` are ordinary outcomes (the user paused, or
     * the mic was closed) and stay silent; everything else is surfaced.
     */
    instance.onerror = (event) => {
      const code = event?.error;
      if (code !== 'no-speech' && code !== 'aborted') {
        setVoiceError(
          code === 'not-allowed' || code === 'service-not-allowed'
            ? 'Microphone access is blocked — you can type instead.'
            : 'Dictation could not start here — you can type instead.',
        );
      }
      setListening(false);
    };

    recognition.current = instance;

    try {
      instance.start();
    } catch {
      setVoiceError('Dictation could not start here — you can type instead.');
      setListening(false);
      return;
    }

    setListening(true);
  };

  return (
    <form
      action="/search"
      method="get"
      role="search"
      aria-label="Describe the work you need done"
      id="prompt-box"
      className="mx-auto w-full max-w-3xl rounded-2xl border border-white/20 bg-white p-4 text-left shadow-2xl transition-all sm:p-5"
    >
      {/* Mode strip */}
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 p-1">
          <span className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1 font-mono text-[12px] font-semibold text-primary shadow-xs">
            <PencilLine aria-hidden="true" className="h-[15px] w-[15px]" />
            Describe it
          </span>
          {voiceSupported ? (
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              aria-pressed={listening}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-mono text-[12px] transition-colors ${
                listening
                  ? 'bg-white text-amber-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {listening ? (
                <Square aria-hidden="true" className="h-[15px] w-[15px]" />
              ) : (
                <Mic aria-hidden="true" className="h-[15px] w-[15px]" />
              )}
              {listening ? 'Stop' : 'Say it'}
            </button>
          ) : null}
        </div>

        <div className="hidden items-center gap-1 font-mono text-[11px] text-slate-400 sm:flex">
          <Zap aria-hidden="true" className="h-[13px] w-[13px] text-secondary" />
          <span>Free to post</span>
        </div>
      </div>

      {/* Input */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 transition-all focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20">
        <label htmlFor="outcome-input" className="sr-only">
          What do you need done?
        </label>
        <textarea
          id="outcome-input"
          name="q"
          rows={3}
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder="e.g. The kitchen tap is leaking and the shut-off valve under the sink won't close. I need someone this week."
          className="w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-slate-900 outline-none placeholder:text-slate-400 sm:text-base"
        />
        {listening ? (
          <div className="mt-2 flex w-fit items-center gap-2 rounded-lg border border-amber-200 bg-secondary-light px-3 py-1.5">
            <Mic aria-hidden="true" className="h-4 w-4 animate-pulse text-secondary" />
            <span className="font-mono text-[12px] font-semibold text-amber-800">
              Listening — describe the work out loud
            </span>
          </div>
        ) : null}

        {/* Rose is the design's own "blocked" status colour, so a failed
            dictation attempt reads as a status rather than a new alert style. */}
        {voiceError ? (
          <div className="mt-2 flex w-fit items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5">
            <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <span className="font-mono text-[12px] font-semibold text-rose-800">{voiceError}</span>
          </div>
        ) : null}
      </div>

      {/* Submit bar */}
      <div className="mt-2 flex flex-col justify-between gap-3 pt-3.5 sm:flex-row sm:items-center">
        <span className="flex items-center gap-1 font-mono text-[12px] text-slate-500">
          <Zap aria-hidden="true" className="h-[15px] w-[15px] text-primary" />
          No obligation to hire. Quotes are itemized.
        </span>
        <button
          type="submit"
          className="group flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-primary-dark hover:shadow-lg active:scale-[0.99]"
        >
          <Sparkles
            aria-hidden="true"
            className="h-[18px] w-[18px] text-amber-300 transition-transform group-hover:rotate-12"
          />
          Find matching providers
        </button>
      </div>
    </form>
  );
}

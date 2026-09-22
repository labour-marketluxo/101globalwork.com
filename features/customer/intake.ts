/**
 * The guided intake's vocabulary and its deterministic classifier.
 *
 * PURE AND CLIENT-SAFE: the composer and the step forms import this, so nothing here may reach the
 * Supabase server client.
 *
 * ⚠️ THERE IS NO AI HERE, AND THE UI SAYS SO. The brief asks for "AI suggestion fallback
 * (deterministic input if AI unavailable)". No model is wired into this repository and no key exists
 * for one, so the deterministic path is the only path — a keyword match against the service
 * catalogue, run on the server, shown as a suggestion the visitor can ignore. Calling it a suggestion
 * is honest; calling it AI would not be, and a wrong service silently chosen on the visitor's behalf
 * is worse than no choice at all.
 */

export type ServiceOption = { id: string; name: string };

/** Words that point at a kind of work. Matched against the description AND the catalogue entry. */
const SERVICE_SIGNALS: ReadonlyArray<{ tag: string; words: RegExp }> = [
  { tag: 'plumbing', words: /\b(pipe|plumb|leak|tap|toilet|sink|bath|shower|water|drain|sewage|cistern)\b/i },
  { tag: 'electrical', words: /\b(electric|wiring|wire|socket|outlet|light|bulb|breaker|fuse|inverter|generator|meter|shock)\b/i },
  { tag: 'hvac', words: /\b(air condition|\bac\b|hvac|cooling|refrigerat|freezer|fridge|compressor)\b/i },
  { tag: 'cleaning', words: /\b(clean|wash|laundry|tidy|fumigat|pest|roach|rodent|mould|mold|dust)\b/i },
  { tag: 'carpentry', words: /\b(carpent|wood|wardrobe|cabinet|door|window|roof|ceiling|furniture|shelf|bed)\b/i },
  { tag: 'painting', words: /\b(paint|repaint|emulsion|gloss|wall finish|plaster)\b/i },
  { tag: 'appliances', words: /\b(washing machine|microwave|oven|cooker|appliance|repair the)\b/i },
  { tag: 'tailoring', words: /\b(tailor|sew|dress|cloth|fabric|hem|garment|alter)\b/i },
  { tag: 'moving', words: /\b(move|moving|relocat|transport|haul|deliver|logistics)\b/i },
  // ⚠️ "floor" IS DELIBERATELY NOT A TILING WORD, and a real run is why. `\bfloor\b` matches "FIRST
  // floor flat" — a phrase this very file uses in its own placeholder — so a leaking tap in a
  // first-floor flat was labelled `plumbing, tiling` and got the tiler's questions. A keyword that
  // fires on ordinary location language is worse than one that misses: a miss leaves the generic
  // questions in place, while a false hit shows somebody the wrong trade above their own words.
  { tag: 'tiling', words: /\b(tile|tiles|tiled|tiling|retiling|screed|marble|grout)\b/i },
];

/** Which tags are hazardous enough to warn about before the request is submitted. */
const HAZARDOUS_TAGS = new Set(['electrical', 'hvac']);

export type IntentSuggestion = {
  service: ServiceOption | null;
  /** Every signal tag the description matched, for the "why this suggestion" line. */
  tags: string[];
  hazardous: boolean;
};

/**
 * Suggest a service from the description, deterministically.
 *
 * Two passes: tags matched in the free text, then tags matched against catalogue entries. A service
 * whose name carries a matched tag wins over one that does not, and ties fall to the first in the
 * catalogue so the same description always produces the same suggestion.
 */
export function suggestService(needText: string, services: readonly ServiceOption[]): IntentSuggestion {
  const text = needText.toLowerCase();
  const tags = SERVICE_SIGNALS.filter(signal => signal.words.test(text)).map(signal => signal.tag);

  let best: ServiceOption | null = null;
  let bestScore = 0;

  for (const service of services) {
    const name = service.name.toLowerCase();
    // Catalogue entries are matched on their own words AND on the tags, so "Fixing a leaking pipe"
    // finds "Plumbing repair" even though the two share no tokens.
    const score = tags.reduce((total, tag) => {
      const signal = SERVICE_SIGNALS.find(candidate => candidate.tag === tag);
      return total + (signal && signal.words.test(name) ? 2 : 0);
    }, 0) +
      tags.reduce((total, tag) => total + (name.includes(tag) ? 1 : 0), 0);

    if (score > bestScore) {
      best = service;
      bestScore = score;
    }
  }

  return { service: best, tags, hazardous: tags.some(tag => HAZARDOUS_TAGS.has(tag)) };
}

export type ClarifyQuestion = {
  id: string;
  question: string;
  /** "Why we ask this" — shown behind a disclosure, because the brief asks for it to be available. */
  why: string;
  kind: 'text' | 'choice';
  options?: readonly string[];
  placeholder?: string;
  /** Optional extra: these are the questions people most often cannot answer on the spot. */
  measurable?: boolean;
};

const ACCESS_QUESTION: ClarifyQuestion = {
  id: 'access_constraints',
  question: 'How does a provider get to the work, and is anything restricted?',
  why: 'Access is where site visits fail. A locked gate, a compound that needs announcing, a landlord who must be told, or work that can only be done at certain hours changes how long the job takes to quote and to schedule.',
  kind: 'text',
  placeholder: 'e.g. ground-floor flat, gate code at the barrier, work must stop by 6pm',
};

const SITE_QUESTION: ClarifyQuestion = {
  id: 'site_detail',
  question: 'Where exactly on the property is it?',
  why: 'The same problem is quoted differently depending on the building it is in — a first-floor bathroom, a rooftop tank and a shop front are three different jobs.',
  kind: 'text',
  placeholder: 'e.g. first-floor bathroom, behind the kitchen units',
};

const MATERIALS_QUESTION: ClarifyQuestion = {
  id: 'materials',
  question: 'Who supplies the materials, and are any already on site?',
  why: 'Materials are usually the largest line in a quote. Whether the provider brings them changes both the price and how soon the work can start.',
  kind: 'choice',
  options: ['Provider should supply', 'I will supply', 'Some already on site', 'Not sure yet'],
};

const MEASUREMENTS_QUESTION: ClarifyQuestion = {
  id: 'measurements',
  question: 'Any measurements you already know?',
  why: 'Measurements turn an estimate into a quote. Without them a provider has to come and measure, which adds a visit before any price can be given.',
  kind: 'text',
  placeholder: 'e.g. 2.4m by 1.9m, or a photo of the maker’s plate',
  measurable: true,
};

const TIMING_WITHIN_DAY: ClarifyQuestion = {
  id: 'within_day',
  question: 'Does the work have to happen at a particular time of day?',
  why: 'Noise, water shut-offs and power cuts affect neighbours. Providers schedule around what the building allows, and telling them now avoids a second trip.',
  kind: 'choice',
  options: ['Any time', 'Mornings only', 'Afternoons only', 'Evenings', 'Weekends only'],
};

const POWER_STATE: ClarifyQuestion = {
  id: 'power_state',
  question: 'Is the power off at the affected point right now?',
  why: 'This is the one answer that changes whether an electrician comes today or tomorrow, and whether anyone should touch anything before they arrive.',
  kind: 'choice',
  options: ['Power is off', 'Power is on and something is sparking or hot', 'Power is on and nothing is hot', 'Not sure'],
};

const AREA_QUESTION: ClarifyQuestion = {
  id: 'area',
  question: 'Roughly how much is there to do?',
  why: 'Size is what separates a small job from a day’s work, and it is the first thing a provider needs to price fairly.',
  kind: 'text',
  placeholder: 'e.g. three bedrooms and a sitting room, or one flat',
};

const EQUIPMENT_QUESTION: ClarifyQuestion = {
  id: 'equipment',
  question: 'Make and model, if you can find it?',
  why: 'Models differ in parts and in whether they are worth repairing. The plate is usually on the back or inside the door.',
  kind: 'text',
  placeholder: 'e.g. LG, model number on the sticker inside the door',
};

const HABITABILITY_QUESTION: ClarifyQuestion = {
  id: 'habitability',
  question: 'Is the property still usable while this is being fixed?',
  why: 'If it is not — no water, no power, no toilet — the work is urgent in a way that has nothing to do with the size of the job.',
  kind: 'choice',
  options: ['Yes, usable', 'No, and it cannot wait', 'Partly'],
};

/**
 * The question set for a description. Always includes access and site detail; adds the questions that
 * the matched trades actually need. Never more than five — a clarification step people abandon is
 * worse than a quote that needs one more message.
 */
export function clarifyingQuestions(tags: readonly string[]): ClarifyQuestion[] {
  const questions: ClarifyQuestion[] = [ACCESS_QUESTION, SITE_QUESTION];

  const has = (tag: string) => tags.includes(tag);

  if (has('plumbing')) questions.push(TIMING_WITHIN_DAY, HABITABILITY_QUESTION);
  if (has('electrical')) questions.push(POWER_STATE, TIMING_WITHIN_DAY);
  if (has('hvac')) questions.push(EQUIPMENT_QUESTION, MATERIALS_QUESTION);
  if (has('cleaning')) questions.push(AREA_QUESTION, TIMING_WITHIN_DAY);
  if (has('carpentry') || has('tiling')) questions.push(MEASUREMENTS_QUESTION, MATERIALS_QUESTION);
  if (has('painting')) questions.push(AREA_QUESTION, MATERIALS_QUESTION);
  if (has('appliances')) questions.push(EQUIPMENT_QUESTION, MEASUREMENTS_QUESTION);
  if (has('tailoring')) questions.push(MEASUREMENTS_QUESTION, MATERIALS_QUESTION);
  if (has('moving')) questions.push(AREA_QUESTION, TIMING_WITHIN_DAY);

  if (questions.length === 2) {
    // Nothing matched a trade: ask the two questions that apply to any work at all.
    questions.push(MATERIALS_QUESTION, MEASUREMENTS_QUESTION);
  }

  return questions.slice(0, 5);
}

export const NOT_SURE = 'not_sure';

export type UrgencyChoice = {
  value: 'emergency_redirect' | 'urgent' | 'soon' | 'normal';
  label: string;
  detail: string;
};

/**
 * The three choices the brief asks for, mapped onto the enum this schema already has
 * (`request_urgency`: emergency_redirect | urgent | soon | normal).
 */
export const URGENCY_CHOICES: readonly UrgencyChoice[] = [
  {
    value: 'emergency_redirect',
    label: 'Emergency',
    detail: 'Something is unsafe, or the property cannot be used. Nothing on this page dispatches anyone — an emergency is a call to the emergency services first, and this platform is not one of them.',
  },
  {
    value: 'urgent',
    label: 'Within 24 hours',
    detail: 'Sooner than the usual matching window, and priced accordingly by providers.',
  },
  {
    value: 'soon',
    label: 'Within a few days',
    detail: 'The common case: enough time to collect quotes and compare them.',
  },
  {
    value: 'normal',
    label: 'Flexible',
    detail: 'No particular hurry. Flexible work is usually the cheapest and the easiest to schedule.',
  },
];

export const CONTACT_PREFERENCES = [
  { value: 'in_app', label: 'In this app', detail: 'Quotes and updates appear on your requests.' },
  { value: 'email', label: 'Email', detail: 'Recorded on the request for whichever channel is built first.' },
  { value: 'sms', label: 'SMS', detail: 'Recorded on the request for whichever channel is built first.' },
] as const;

export const SAFETY_REMINDER =
  'Never include passwords, PINs, bank details or card numbers in a description. Nothing you type here needs them, and this text is sent to every provider who is matched to the work.';

/**
 * The reference a customer quotes to support. Derived from the request id rather than stored
 * separately, so there is exactly one identifier in the system and no way for the two to disagree.
 */
export function requestReference(requestId: string): string {
  return `REQ-${requestId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export const INTAKE_STEPS = ['intent', 'clarify', 'logistics', 'review'] as const;
export type IntakeStep = (typeof INTAKE_STEPS)[number];

/**
 * Every URL in the customer workspace, in one place.
 *
 * ⚠️ THE BRIEF SPELLS THESE `/app/customer/...`. There is no `/app` prefix anywhere in this app's
 * URLs — that is the route group `(app)`, which never appears in a path — so the real routes are
 * `/customer/...`. Treating `/app/customer` as a literal URL would have created a prefix used by
 * nothing else and broken the sub-navigation the brief also asks for.
 */
export const CUSTOMER_PATHS = {
  dashboard: '/customer',
  newRequest: '/customer/requests/new',
  clarify: '/customer/requests/new/clarify',
  logistics: '/customer/requests/new/logistics',
  review: '/customer/requests/new/review',
  confirmation: (requestId: string) => `/customer/requests/${requestId}/confirmation`,
} as const;

/** Error codes the step pages render. A fixed vocabulary: the parameter is user-editable. */
export const INTAKE_FAILURES = [
  'save_failed',
  'not_found',
  'already_submitted',
  'missing_description',
  'consent_required',
] as const;
export type IntakeFailure = (typeof INTAKE_FAILURES)[number];

export const INTAKE_FAILURE_COPY: Record<IntakeFailure, string> = {
  save_failed: 'That step could not be saved. Nothing you typed was lost — try again.',
  not_found: 'That draft is no longer available. It may have been submitted already, or it belongs to another account.',
  already_submitted: 'This request has already been submitted, so it cannot be edited any more. Providers may be reading it.',
  missing_description: 'Write a sentence or two about the work before submitting — providers quote from it.',
  consent_required: 'Tick the contact and terms box before submitting.',
};

export function intakeFailureCode(value: string | undefined | null): IntakeFailure | null {
  if (!value) return null;
  return (INTAKE_FAILURES as readonly string[]).includes(value) ? (value as IntakeFailure) : null;
}

/**
 * The structured scope, as stored in `request_scopes.scope_json`.
 *
 * One shape, declared once: the wizard writes it, the review step reads it back, and the confirmation
 * page shows it — three readers of the same JSON, which is exactly the situation where an undeclared
 * shape becomes three disagreeing guesses.
 */
export type RequestScope = {
  answers?: Record<string, string>;
  not_sure?: string[];
  access_notes?: string;
  landmark?: string;
  area_text?: string;
  preferred_window?: string;
  preferred_date?: string;
  contact_preference?: string;
  hazardous?: boolean;
  agreed_at?: string;
  classifier?: { service_id: string | null; service_name: string | null };
};

export const STEP_LABELS: Record<IntakeStep, string> = {
  intent: 'Intent',
  clarify: 'Clarify',
  logistics: 'Logistics',
  review: 'Review',
};

/** Where a step sits in the bar, 1-based — used for "Step 2 of 4" and the progress bar's width. */
export function stepNumber(step: IntakeStep): number {
  return INTAKE_STEPS.indexOf(step) + 1;
}

/**
 * The help centre's knowledge base — the articles, the search, and the publication boundary.
 *
 * ── WHY THE CONTENT IS IN THE REPOSITORY ─────────────────────────────────────────────────────
 *
 * The same reasoning as features/marketing/guides.ts, and the same rule about what may be written here:
 * every claim has to be true of this platform and already published somewhere else. A knowledge base is
 * the page people read when they are already unhappy, so a confident sentence that is out of date is
 * worse here than anywhere else. Where a guide touches something the platform does not do yet — a fee
 * schedule, a translation, an SMS factor — it says so.
 *
 * ── THE PUBLICATION BOUNDARY IS AN ALLOWLIST, AND IT IS ENFORCED ─────────────────────────────
 *
 * An article record carries editorial fields that must never reach a browser: `draft` (whether the article
 * is published at all) and `editorNote` (what an editor still has to check). `PublicHelpArticle` has no such
 * keys — not optional ones, not undefined ones — because a field that exists on a type is a field that ends
 * up in JSON.stringify of that type's value, in a JSON-LD block, or in a sitemap entry.
 *
 * `publishHelpArticle` builds the public shape FIELD BY FIELD, and `assertPublicShape` warns in development
 * if anything outside `PUBLIC_ARTICLE_FIELDS` ever appears on a published object. That warning is the point:
 * a denylist would have to be updated by the next person who adds an editorial field, and they will not know
 * it exists. Same reasoning as the session projection allowlist and the public status projection.
 *
 * Drafts are filtered at the projection, not at the page, so a route that forgets to filter cannot serve
 * one: `getPublishedArticle` and every listing go through the same two functions.
 */

export type HelpAudience = 'customer' | 'provider' | 'organisation' | 'everyone';

export type HelpSection = {
  /** Stable anchor, used by the table of contents and by search deep links. */
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

/** The internal record. ⚠️ `draft` and `editorNote` are editorial and NEVER published. */
export type HelpArticleRecord = {
  slug: string;
  category: string;
  title: string;
  summary: string;
  audience: HelpAudience;
  /** ISO date the copy was last checked against the product. */
  reviewedAt: string;
  readMinutes: number;
  sections: HelpSection[];
  /** Search terms a reader would type rather than the words the article uses. */
  keywords: string[];
  related: { label: string; href: string }[];
  /** INTERNAL. Unpublished articles are invisible to every public surface. */
  draft: boolean;
  /** INTERNAL. What an editor still has to check before this can be published. */
  editorNote?: string;
};

/**
 * The public article, and the complete list of what may cross into a browser.
 *
 * Kept as a `readonly` array so the shape check below and the type cannot drift apart: a field added to the
 * type without being added here is caught by `assertPublicShape` in development.
 */
export const PUBLIC_ARTICLE_FIELDS = [
  'slug',
  'category',
  'title',
  'summary',
  'audience',
  'reviewedAt',
  'readMinutes',
  'sections',
  'keywords',
  'related',
  'href',
  'categoryTitle',
] as const;

export type PublicHelpArticle = {
  slug: string;
  category: string;
  /** Denormalised for metadata and JSON-LD, which need the section name without a second lookup. */
  categoryTitle: string;
  title: string;
  summary: string;
  audience: HelpAudience;
  reviewedAt: string;
  readMinutes: number;
  sections: HelpSection[];
  keywords: string[];
  related: { label: string; href: string }[];
  /** The canonical path, built once here so no caller can spell it differently. */
  href: string;
};

export type HelpCategoryRecord = {
  slug: string;
  title: string;
  summary: string;
  audience: HelpAudience;
  /** Which audience this section is written for, in one line, shown on the hub card. */
  forLine: string;
  /** INTERNAL. Nothing renders this; it exists so the ordering rule is written down once. */
  note?: string;
};

export type PublicHelpCategory = {
  slug: string;
  title: string;
  summary: string;
  audience: HelpAudience;
  forLine: string;
  href: string;
  articleCount: number;
};

export const HELP_CATEGORIES: readonly HelpCategoryRecord[] = [
  {
    slug: 'customer',
    title: 'Customer guides',
    summary: 'Posting work, comparing quotes, and approving what has been done.',
    forLine: 'For people and businesses commissioning work',
    audience: 'customer',
  },
  {
    slug: 'provider',
    title: 'Provider guides',
    summary: 'Getting approved, quoting, and getting paid for work you have done.',
    forLine: 'For providers and their teams',
    audience: 'provider',
  },
  {
    slug: 'organisation',
    title: 'Organisation guides',
    summary: 'Members and roles, budgets, cost centres and the approvals inbox.',
    forLine: 'For organisation owners and administrators',
    audience: 'organisation',
  },
  {
    slug: 'payments',
    title: 'Payments, fees and refunds',
    summary: 'Where money is held, when it is released, and what happens when it is not.',
    forLine: 'For everyone, on either side of a job',
    audience: 'everyone',
  },
  {
    slug: 'safety',
    title: 'Safety and disputes',
    summary: 'Raising a concern, disputing a payment, and what the platform can and cannot do.',
    forLine: 'For everyone, on either side of a job',
    audience: 'everyone',
  },
  {
    slug: 'account',
    title: 'Account and security',
    summary: 'Signing in, two-factor, contacts, and which notices reach you.',
    forLine: 'For everyone with an account',
    audience: 'everyone',
  },
];

export const HELP_ARTICLES: readonly HelpArticleRecord[] = [
  // ── Customer ────────────────────────────────────────────────────────────────────────────────
  {
    slug: 'posting-a-request-that-gets-useful-quotes',
    category: 'customer',
    title: 'Posting a request that gets useful quotes',
    summary:
      'What to put on a request so providers can price it, and why two quotes for one job should differ in their numbers rather than in what they claim to include.',
    audience: 'customer',
    reviewedAt: '2026-09-24',
    readMinutes: 4,
    keywords: ['post a request', 'brief', 'scope', 'photos', 'how to describe the work'],
    related: [
      { label: 'How it works', href: '/how-it-works' },
      { label: 'How to compare itemized quotes', href: '/ng/guides/how-to-compare-itemized-quotes' },
    ],
    draft: false,
    sections: [
      {
        id: 'what-to-write',
        title: 'What to write',
        paragraphs: [
          'Describe the work, not the price. Every provider quoting your request quotes against the scope you wrote on it, which is what makes the quotes comparable — a request that names a budget bracket gets quotes that disagree about what is included.',
          'Say where the work is, when it can be done, and anything about access: a gate code, a lift, a parking restriction, a tenant who has to be told first. Access is the most common reason a job takes longer than the quote suggested, and it is the cheapest thing to write down.',
        ],
        bullets: [
          'What has to be different when the work is finished, in your words',
          'The location and anything that limits access or working hours',
          'Whether materials are being supplied, and by whom',
          'Anything a provider must not touch, move or replace',
        ],
      },
      {
        id: 'photos',
        title: 'Photos do more than paragraphs',
        paragraphs: [
          'A photograph of the actual thing saves a round of questions and usually shows something the description left out — the pipe behind the unit, the state of the wall under the tiles.',
          'Photographs are attached to the request and are visible to the providers who can quote for it. Do not include anything you would not want a stranger to see: paperwork with a name and address on it, a number plate, a neighbour\u2019s property.',
        ],
      },
      {
        id: 'what-happens-next',
        title: 'What happens next',
        paragraphs: [
          'The request is matched to providers whose services, service areas and verification allow them to quote for it. They can each submit one quote, and every quote keeps its versions so you can see what changed if they revise it.',
          'You choose which quote to accept, and only one can be accepted for a request. Nothing is agreed until you accept one, and nothing is carried out until the agreed work is described on the accepted quote.',
        ],
      },
    ],
  },
  {
    slug: 'comparing-quotes-and-accepting-one',
    category: 'customer',
    title: 'Comparing quotes and accepting one',
    summary:
      'How to read a quote line by line, what an exclusion costs you, and what accepting a quote commits you to.',
    audience: 'customer',
    reviewedAt: '2026-09-24',
    readMinutes: 4,
    keywords: ['quote', 'accept a quote', 'exclusions', 'price', 'compare'],
    related: [
      { label: 'How to compare itemized quotes', href: '/ng/guides/how-to-compare-itemized-quotes' },
      { label: 'Trust and safety', href: '/trust-and-safety' },
    ],
    draft: false,
    sections: [
      {
        id: 'read-the-exclusions',
        title: 'Read the exclusions first',
        paragraphs: [
          'Exclusions decide the final bill more often than the headline figure does. A quote that excludes removal, access equipment or making good is not necessarily a bad quote — it is a quote whose number is not the number you will pay.',
        ],
      },
      {
        id: 'what-accepting-means',
        title: 'What accepting a quote means',
        paragraphs: [
          'Accepting a quote creates the agreement for that work: the accepted version is frozen, and the provider works to it. From then on the scope is a document rather than a conversation.',
          'After the agreement is accepted, the payment for the agreed amount is funded before the work starts. The platform does not start paid work on an unfunded agreement, because a job that has already been done is not a position from which anybody can negotiate.',
        ],
      },
      {
        id: 'asking-for-changes',
        title: 'Asking for changes',
        paragraphs: [
          'If something needs to change after you have accepted a quote — a different material, a part found on inspection, extra work worth adding — that is a change to agree before it happens, and it is recorded against the project. Nothing is carried out and then invoiced.',
          'A message thread is where you discuss it; the change request is where you agree it. A price agreed only in a thread is not a price the platform can hold anyone to.',
        ],
      },
    ],
  },
  {
    slug: 'from-acceptance-to-approval',
    category: 'customer',
    title: 'From acceptance to approval',
    summary:
      'Scheduling, what the provider records while working, and what approving completion actually releases.',
    audience: 'customer',
    reviewedAt: '2026-09-24',
    readMinutes: 5,
    keywords: ['schedule', 'appointment', 'approve completion', 'evidence', 'work steps'],
    related: [
      { label: 'My work', href: '/work' },
      { label: 'Trust and safety', href: '/trust-and-safety' },
    ],
    draft: false,
    sections: [
      {
        id: 'scheduling',
        title: 'Agreeing a time',
        paragraphs: [
          'Either side can propose a time. A proposal is not a booking: the appointment exists when both sides have agreed to the same window, and it can be moved again the same way.',
          'If a provider cannot make an agreed time, the change is recorded on the project rather than sent as a message you have to remember.',
        ],
      },
      {
        id: 'while-the-work-happens',
        title: 'While the work happens',
        paragraphs: [
          'The provider works through a task list and records progress against it, and can attach evidence — photographs, documents, notes — as the work goes on. You can read all of it as it is recorded.',
          'If something on site blocks the work, the provider can pause the job and record why. A paused job is visible to you, which is the difference between a delay you can plan around and one you find out about afterwards.',
        ],
      },
      {
        id: 'approving',
        title: 'Approving the work',
        paragraphs: [
          'When the provider submits the work as complete, you review what was submitted and either approve it or send it back with what still needs doing. Approving completion is what releases the payment.',
          'Sending work back is not a dispute and costs nothing: it records what is still outstanding against the specific items, and the provider carries on. A dispute is a different thing, for when the disagreement is about money rather than about finishing the job.',
        ],
      },
    ],
  },

  // ── Provider ────────────────────────────────────────────────────────────────────────────────
  {
    slug: 'getting-ready-to-quote',
    category: 'provider',
    title: 'Getting ready to quote',
    summary:
      'What has to be in place before a provider can quote, and what a lapsed document pauses.',
    audience: 'provider',
    reviewedAt: '2026-09-24',
    readMinutes: 4,
    keywords: ['verification', 'onboarding', 'credentials', 'licence', 'insurance', 'search readiness'],
    related: [
      { label: 'Trust and safety', href: '/trust-and-safety' },
      { label: 'Become a provider', href: '/providers' },
    ],
    draft: false,
    sections: [
      {
        id: 'what-has-to-be-in-place',
        title: 'What has to be in place',
        paragraphs: [
          'A provider profile is published once it has an identity check, at least one service, and a service area. Those three are the minimum that makes the profile useful to somebody searching for work.',
          'Individual services can additionally require a credential — a licence, a certificate, an insurance detail. Those requirements are set per service, so what you need depends on the work you want to be offered.',
        ],
      },
      {
        id: 'what-verification-means',
        title: 'What verification means, and what it does not',
        paragraphs: [
          'Verification records that a document or an identity was checked, and when. It is not insurance and it is not a guarantee: the platform does not vouch for the quality of anybody\u2019s work, and nobody should read a verified badge as a promise about the job.',
        ],
      },
      {
        id: 'when-something-lapses',
        title: 'When something lapses',
        paragraphs: [
          'A credential with an expiry date pauses what it covers when it lapses. Quoting for a service that needs it stops until it is renewed, and work already agreed is not affected by a document going out of date mid-job.',
          'Keeping details current is your side of the bargain. The platform will not send a reminder that it cannot prove it sent, so the credential pages show what is expiring and when.',
        ],
      },
    ],
  },
  {
    slug: 'writing-a-quote',
    category: 'provider',
    title: 'Writing a quote that holds up',
    summary:
      'Itemising the work, stating what is excluded, and why a revised quote keeps its history.',
    audience: 'provider',
    reviewedAt: '2026-09-24',
    readMinutes: 4,
    keywords: ['quote', 'itemise', 'exclusions', 'validity', 'revision'],
    related: [
      { label: 'How to compare itemized quotes', href: '/ng/guides/how-to-compare-itemized-quotes' },
      { label: 'Pricing and fees', href: '/pricing' },
    ],
    draft: false,
    sections: [
      {
        id: 'itemise',
        title: 'Itemise the work',
        paragraphs: [
          'A quote is a list, not a number. Each line is a piece of the work against the scope on the request: labour, materials, access, removal, making good. The customer is comparing your lines with somebody else\u2019s, and a single figure removes the thing they are comparing.',
          'Quote the scope that was asked for. If you think the work needs to be different, say so in a message or quote the scope and note the alternative — quoting a different job is how a quote stops being comparable and the conversation restarts.',
        ],
      },
      {
        id: 'exclusions-and-validity',
        title: 'Exclusions and validity',
        paragraphs: [
          'State what is excluded, and how long the price holds. Both protect you: an exclusion written down is a line the customer can ask about, and a validity date that is visible is a price that does not have to be honoured months later.',
        ],
      },
      {
        id: 'revisions',
        title: 'Revisions',
        paragraphs: [
          'If you revise a quote, the earlier version is kept. That is not a record of a mistake — it is what lets both sides see what changed and agree to the current version rather than to whichever one they happen to remember.',
        ],
      },
    ],
  },
  {
    slug: 'delivering-work-and-getting-paid',
    category: 'provider',
    title: 'Delivering work and getting paid',
    summary:
      'Recording progress, submitting evidence, and how a job moves from completed to paid.',
    audience: 'provider',
    reviewedAt: '2026-09-24',
    readMinutes: 5,
    keywords: ['evidence', 'submit work', 'payout', 'completion', 'paid'],
    related: [
      { label: 'Earnings and payouts', href: '/provider/earnings' },
      { label: 'Trust and safety', href: '/trust-and-safety' },
    ],
    draft: false,
    sections: [
      {
        id: 'record-as-you-go',
        title: 'Record it as you go',
        paragraphs: [
          'Progress, blockers and evidence are recorded against the job while it is happening. The record is what a customer reads when they decide whether to approve, and it is what the platform reads if a payment is ever disputed.',
          'Evidence attaches to the specific thing it shows. Photographs taken at the end of a job, showing a finished result, cannot settle a question about what was behind the panel when you started.',
        ],
      },
      {
        id: 'submitting',
        title: 'Submitting the work',
        paragraphs: [
          'Submitting completion puts the job in front of the customer for approval, with everything you recorded attached. If they send it back, what is still outstanding is recorded against the items rather than as a message you have to interpret.',
        ],
      },
      {
        id: 'getting-paid',
        title: 'Getting paid',
        paragraphs: [
          'The payment was funded when the agreement was accepted, and it is held by the payment provider until the work is approved. Approval makes the money eligible for payout; the platform then pays it out on its own schedule, which is shown on the earnings pages.',
          'An open dispute blocks the payout while it is unresolved. That is the point of the hold: the money cannot move while the agreed scope and the finished work are being compared.',
        ],
      },
    ],
  },

  // ── Organisation ────────────────────────────────────────────────────────────────────────────
  {
    slug: 'setting-up-an-organisation-account',
    category: 'organisation',
    title: 'Setting up an organisation account',
    summary:
      'What an organisation is for, the roles a member can hold, and how invitations work.',
    audience: 'organisation',
    reviewedAt: '2026-09-24',
    readMinutes: 3,
    keywords: ['organisation', 'business account', 'members', 'roles', 'invite'],
    related: [{ label: 'Organisation workspace', href: '/org/new' }],
    draft: false,
    sections: [
      {
        id: 'what-it-is',
        title: 'What an organisation is',
        paragraphs: [
          'An organisation is a business entity that holds its own projects, budgets and members. Work posted by an organisation belongs to the organisation rather than to the person who typed it, so it stays with the business when somebody leaves.',
          'One sign-in can belong to several organisations and still act personally. Switching between them is a matter of which workspace you open, not a setting you have to save.',
        ],
      },
      {
        id: 'roles',
        title: 'Roles',
        paragraphs: [
          'Members hold one role, and the role decides what they can do: owners and administrators manage the entity and its members, project managers run projects, finance approvers decide on money, and provider team members act for a provider inside the organisation.',
        ],
      },
      {
        id: 'invitations',
        title: 'Invitations',
        paragraphs: [
          'Invitations are sent to an email address and accepted by whoever controls it. An invitation is not a grant until it is accepted, and it can be revoked before that.',
        ],
      },
    ],
  },
  {
    slug: 'budgets-and-approvals',
    category: 'organisation',
    title: 'Budgets, cost centres and approvals',
    summary: 'How spending is tracked against a budget and how an approval decision is recorded.',
    audience: 'organisation',
    reviewedAt: '2026-09-24',
    readMinutes: 3,
    keywords: ['budget', 'approval', 'cost centre', 'spend', 'authorisation'],
    related: [{ label: 'Organisation workspace', href: '/org/new' }],
    draft: false,
    sections: [
      {
        id: 'budgets',
        title: 'Budgets',
        paragraphs: [
          'A budget is set for a period and covers the organisation\u2019s projects. Spending is counted against it as obligations are funded, so the number reflects money committed rather than money already paid out.',
          'Projects can be assigned to a cost centre, which is how spending is attributed to a part of the business rather than to the entity as a whole.',
        ],
      },
      {
        id: 'approvals',
        title: 'Approvals',
        paragraphs: [
          'Where an organisation requires one, a decision goes to the approvals inbox before it takes effect. The decision is recorded against the project with who made it and when, which is the record an auditor asks for.',
          'Approval is about authorisation inside your organisation. It does not change what the platform holds or when a payment is released.',
        ],
      },
    ],
  },

  // ── Payments ────────────────────────────────────────────────────────────────────────────────
  {
    slug: 'how-money-is-held-and-released',
    category: 'payments',
    title: 'How money is held and released',
    summary:
      'Where the money actually sits while a job is running, and what releases it. The platform is not the holder.',
    audience: 'everyone',
    reviewedAt: '2026-09-24',
    readMinutes: 4,
    keywords: ['payment', 'escrow', 'hold', 'release', 'funded', 'where is my money'],
    related: [{ label: 'Trust and safety', href: '/trust-and-safety' }],
    draft: false,
    sections: [
      {
        id: 'not-escrow',
        title: 'It is a hold, not escrow',
        paragraphs: [
          'The platform does not hold your money itself. The payment is taken by the payment provider and held under their terms, and the platform records an obligation against the job and instructs the provider when the money may move.',
          'Escrow is a specific legal arrangement with duties attached to whoever holds the funds. Calling this escrow would overstate what protects you, so the platform does not call it that.',
        ],
      },
      {
        id: 'the-order-of-events',
        title: 'The order of events',
        paragraphs: [
          'A quote is accepted, the agreement is accepted, and the payment is funded — before the work starts. Paid work does not begin on an unfunded agreement.',
          'When the work is submitted and you approve it, the payment becomes eligible to be paid to the provider. Until then it is held, and it can be refunded or disputed through the paths described on the trust and safety page.',
        ],
      },
      {
        id: 'paying-outside',
        title: 'Why you should not pay outside the platform',
        paragraphs: [
          'An agreement that is not funded through the platform removes every protection: there is no hold to release, no refund path, and no record of what was agreed that anybody can act on.',
        ],
      },
    ],
  },
  {
    slug: 'fees-and-what-the-platform-charges',
    category: 'payments',
    title: 'Fees and what the platform charges',
    summary:
      'The fee schedule has not been published. Where that position lives, and why the help centre will not quote a number.',
    audience: 'everyone',
    reviewedAt: '2026-09-24',
    readMinutes: 2,
    keywords: ['fees', 'commission', 'charges', 'percentage', 'pricing'],
    related: [{ label: 'Pricing and fees', href: '/pricing' }],
    draft: false,
    sections: [
      {
        id: 'no-schedule-yet',
        title: 'There is no published schedule yet',
        paragraphs: [
          'No fee schedule has been agreed, so the platform publishes none. The pricing page states this rather than quoting a rate, and it is the page that owns the position — a number in a help article would be a commercial term invented in a support page.',
          'When a schedule exists it will carry an effective date, and quotes will show what applies to them. Until then, a quote on this platform is the whole of what the work costs.',
        ],
      },
    ],
  },
  {
    slug: 'refunds-disputes-and-payout-holds',
    category: 'payments',
    title: 'Refunds, disputes and payout holds',
    summary: 'What moves money when a job does not go to plan, and what each of those states blocks.',
    audience: 'everyone',
    reviewedAt: '2026-09-24',
    readMinutes: 3,
    keywords: ['refund', 'dispute', 'payout hold', 'blocked payout', 'money back'],
    related: [{ label: 'Disputing a payment', href: '/help/safety/disputing-a-payment' }],
    draft: false,
    sections: [
      {
        id: 'refund',
        title: 'A refund',
        paragraphs: [
          'A refund in progress is a hold, not a note. While it is being processed the provider\u2019s payout for that obligation cannot be released, so the same money cannot be sent in two directions.',
        ],
      },
      {
        id: 'dispute',
        title: 'A dispute',
        paragraphs: [
          'A dispute records that the agreed scope and the finished work are being compared. It blocks the payout for the obligation it is raised against until it is resolved, and the resolution is recorded against the dispute rather than agreed in a thread.',
        ],
      },
    ],
  },

  // ── Safety ──────────────────────────────────────────────────────────────────────────────────
  {
    slug: 'reporting-a-safety-concern',
    category: 'safety',
    title: 'Reporting a safety concern',
    summary:
      'How to raise a safety concern, what the platform does with it, and what to do when something is an emergency.',
    audience: 'everyone',
    reviewedAt: '2026-09-24',
    readMinutes: 3,
    keywords: ['safety', 'report', 'harm', 'threat', 'fraud', 'urgent'],
    related: [
      { label: 'Trust and safety', href: '/trust-and-safety' },
      { label: 'Open a support case', href: '/support?kind=safety' },
    ],
    draft: false,
    sections: [
      {
        id: 'emergencies-first',
        title: 'If somebody is in danger, this is not the channel',
        paragraphs: [
          'The platform is not an emergency service and does not monitor a queue around the clock. If somebody is at risk of harm, contact the emergency services where the work is taking place, and tell the platform afterwards.',
        ],
      },
      {
        id: 'how-to-raise-it',
        title: 'How to raise it here',
        paragraphs: [
          'Open a support case and describe what happened, on which job, and when. You can attach photographs or documents. A safety case is opened at high priority, which is the one case type that does not let the reporter choose the slowest queue.',
          'Reports are private to you and the platform. The other party is not told who reported what — a report that notifies the person it is about is a report people stop making.',
        ],
      },
      {
        id: 'what-happens-next',
        title: 'What happens next',
        paragraphs: [
          'Safety reports are reviewed by the platform\u2019s trust and safety process. Depending on what is found, an account can be restricted, a case can be opened against a provider, or a payout can be held while the work is investigated.',
          'You get a reply on the case, and the case keeps its own deadline so a report cannot sit unanswered without that being visible to you.',
        ],
      },
    ],
  },
  {
    slug: 'disputing-a-payment',
    category: 'safety',
    title: 'Disputing a payment',
    summary:
      'When to dispute rather than send work back, what the platform compares, and what a dispute does not decide.',
    audience: 'everyone',
    reviewedAt: '2026-09-24',
    readMinutes: 3,
    keywords: ['dispute', 'payment dispute', 'unhappy with work', 'not as agreed'],
    related: [
      { label: 'Trust and safety', href: '/trust-and-safety' },
      { label: 'Open a support case', href: '/support?kind=payment' },
    ],
    draft: false,
    sections: [
      {
        id: 'which-one',
        title: 'Sending work back, or disputing',
        paragraphs: [
          'Sending work back is for work that is not finished: it says what is still outstanding and the provider carries on. A dispute is for money: it is used when the disagreement is about whether what was done matches what was agreed, or about an amount, rather than about the job being incomplete.',
        ],
      },
      {
        id: 'what-a-dispute-does',
        title: 'What a dispute does',
        paragraphs: [
          'It records the problem against the payment, and while it is open the provider\u2019s payout for that obligation is blocked. The money stays where it is while the agreed scope and the finished work are compared.',
          'The resolution is recorded against the dispute. An agreement reached in a message thread is not a resolution the platform can act on, which is why the record matters even when both sides already agree.',
        ],
      },
      {
        id: 'what-it-does-not-decide',
        title: 'What the platform does not decide',
        paragraphs: [
          'The platform holds money and records what was agreed. It does not adjudicate every disagreement about the quality of a job, it does not inspect work, and it does not guarantee an outcome either way.',
        ],
      },
    ],
  },
  {
    slug: 'staying-safe-on-site',
    category: 'safety',
    title: 'Staying safe on site',
    summary: 'The things either side should check before, during and after a visit.',
    audience: 'everyone',
    reviewedAt: '2026-09-24',
    readMinutes: 2,
    keywords: ['safe', 'site visit', 'alone', 'valuables', 'access'],
    related: [{ label: 'Trust and safety', href: '/trust-and-safety' }],
    draft: false,
    sections: [
      {
        id: 'before',
        title: 'Before the visit',
        paragraphs: [
          'Both sides should know who is attending and when, and the appointment should be recorded on the project so there is a shared record of what was agreed rather than a message that can be misread.',
        ],
        bullets: [
          'Keep the scope on the request, so the visit and the job are the same thing on paper',
          'For work at a home, tell somebody else who is coming and when',
          'Move anything valuable or personal out of the working area',
        ],
      },
      {
        id: 'during-and-after',
        title: 'During and after',
        paragraphs: [
          'Anything that changes the job is agreed in writing on the project, not in passing. Anything that feels wrong is worth reporting: the platform would rather review a concern that turns out to be nothing than hear about a serious one months later.',
        ],
      },
    ],
  },

  // ── Account ─────────────────────────────────────────────────────────────────────────────────
  {
    slug: 'keeping-your-account-secure',
    category: 'account',
    title: 'Keeping your account secure',
    summary: 'Passwords, the authenticator app, and how to see and end the sessions on your account.',
    audience: 'everyone',
    reviewedAt: '2026-09-24',
    readMinutes: 4,
    keywords: ['password', 'two-factor', '2fa', 'authenticator', 'sessions', 'signed in devices'],
    related: [{ label: 'Security settings', href: '/settings/security' }],
    draft: false,
    sections: [
      {
        id: 'password',
        title: 'Your password',
        paragraphs: [
          'Passwords must be at least ten characters. The platform does not display a strength meter: it cannot see a pattern the way an attacker would, and a green bar that says "strong" for a password that is already in a breach list is worse than no advice.',
          'Changing your password does not sign your other devices out immediately — each keeps working until it next needs a new token, and then has to sign in again.',
        ],
      },
      {
        id: 'two-factor',
        title: 'Two-factor authentication',
        paragraphs: [
          'You can enrol an authenticator app, which produces a six-digit code every thirty seconds. Once a factor is enrolled, signing in with a password alone is refused, and high-risk actions such as moving money require a session that has passed it.',
          'The platform issues no backup codes, because the authentication provider has no such concept — there is nothing that could be printed that would let you back in. If the device with the authenticator is lost, account recovery through your confirmed email is the way back, and a factor can only be removed by somebody who can already sign in.',
        ],
      },
      {
        id: 'sessions',
        title: 'Sessions and devices',
        paragraphs: [
          'The security settings list every device with a live session, what each one claimed to be, the address it connected from, and when it was last known to be used. Ending one device stops it being given a new token.',
          'The page cannot tell you which city an address is in. It shows each address exactly as it was recorded rather than naming a place it cannot know, because a made-up city is exactly the detail somebody would use to decide that a device is not theirs.',
        ],
      },
    ],
  },
  {
    slug: 'contacts-languages-and-what-reaches-you',
    category: 'account',
    title: 'Contacts, language, and what reaches you',
    summary:
      'How to add a contact and verify it, and how the notification matrix decides what the platform sends.',
    audience: 'everyone',
    reviewedAt: '2026-09-24',
    readMinutes: 3,
    keywords: ['email', 'phone', 'contact', 'notifications', 'preferences', 'language', 'timezone'],
    related: [
      { label: 'Profile settings', href: '/settings/profile' },
      { label: 'Notification preferences', href: '/settings/notifications' },
    ],
    draft: false,
    sections: [
      {
        id: 'sign-in-versus-contacts',
        title: 'The sign-in address is not the same as a contact',
        paragraphs: [
          'The address you sign in with belongs to the authentication provider. Changing it starts a confirmation the provider runs, so the new address has to prove it can receive mail before it becomes your identity on the platform.',
          'Additional contacts are addresses and numbers the platform can reach you on. They start unverified and are unusable until a code comes back, and a code is the only thing that verifies one.',
        ],
      },
      {
        id: 'notices',
        title: 'Which notices reach you',
        paragraphs: [
          'The notification matrix switches email, push, SMS and in-app delivery on and off per event — work updates, financials, marketing. Each switch applies the moment it is pressed.',
          'Security, legal and payment-dispute notices are locked. They are how you find out something has gone wrong with your money or your account, so they cannot be switched off, and the matrix shows why rather than hiding the control.',
        ],
      },
      {
        id: 'delivery-realities',
        title: 'What the platform can actually deliver',
        paragraphs: [
          'Push and SMS have no transport configured in this deployment. The preferences are stored and will apply when one exists, but today only email and in-app delivery reach you — and where the platform queues a message, it can tell you whether anything has tried to send it.',
        ],
      },
    ],
  },

  // ── In progress ─────────────────────────────────────────────────────────────────────────────
  {
    slug: 'credentials-and-insurance-by-service',
    category: 'provider',
    title: 'Credentials and insurance by service',
    summary:
      'Which services ask for which documents, and how an expiry is handled once a document lapses.',
    audience: 'provider',
    reviewedAt: '2026-09-24',
    readMinutes: 3,
    keywords: ['credential', 'licence', 'insurance', 'expiry', 'requirements'],
    related: [{ label: 'Trust and safety', href: '/trust-and-safety' }],
    draft: true,
    editorNote:
      'Waiting on the credential requirements matrix for the remaining launch services. The three services already seeded are correct; the rest would be a table of guesses, and a provider checking whether they may quote must not be reading a guess.',
    sections: [
      {
        id: 'what-is-asked-for',
        title: 'What is asked for',
        paragraphs: [
          'Each service states the documents it requires. Some require none beyond identity, some require a trade licence, and some require evidence of insurance.',
        ],
      },
      {
        id: 'expiry',
        title: 'Expiry',
        paragraphs: [
          'A document with an expiry date pauses what it covers when it lapses. Quoting for that service stops until it is renewed; work already agreed is not affected.',
        ],
      },
    ],
  },
];

// ── The publication boundary ──────────────────────────────────────────────────────────────────

const CATEGORY_BY_SLUG = new Map(HELP_CATEGORIES.map((category) => [category.slug, category]));

export function helpCategoryHref(slug: string): string {
  return `/help/${slug}`;
}

export function helpArticleHref(categorySlug: string, articleSlug: string): string {
  return `/help/${categorySlug}/${articleSlug}`;
}

/**
 * Build the public article, field by field.
 *
 * ⚠️ A DRAFT RETURNS NULL HERE, WHICH IS THE ONLY PLACE THAT DECIDES WHAT IS PUBLISHABLE. Every listing, the
 * sitemap, the search and the JSON-LD go through this function or through something that calls it, so there
 * is no surface that can serve a draft by forgetting to filter.
 */
export function publishHelpArticle(record: HelpArticleRecord): PublicHelpArticle | null {
  if (record.draft) return null;
  const category = CATEGORY_BY_SLUG.get(record.category);
  if (!category) return null;

  const published: PublicHelpArticle = {
    slug: record.slug,
    category: record.category,
    categoryTitle: category.title,
    title: record.title,
    summary: record.summary,
    audience: record.audience,
    reviewedAt: record.reviewedAt,
    readMinutes: record.readMinutes,
    sections: record.sections,
    keywords: record.keywords,
    related: record.related,
    href: helpArticleHref(record.category, record.slug),
  };

  assertPublicShape(published);
  return published;
}

/** Every published article, in the order the record file declares them. */
export function allPublishedArticles(): PublicHelpArticle[] {
  return HELP_ARTICLES.map(publishHelpArticle).filter((article): article is PublicHelpArticle => article !== null);
}

export function publishHelpCategory(record: HelpCategoryRecord): PublicHelpCategory {
  return {
    slug: record.slug,
    title: record.title,
    summary: record.summary,
    audience: record.audience,
    forLine: record.forLine,
    href: helpCategoryHref(record.slug),
    articleCount: allPublishedArticles().filter((article) => article.category === record.slug).length,
  };
}

export function allHelpCategories(): PublicHelpCategory[] {
  return HELP_CATEGORIES.map(publishHelpCategory);
}

export function getHelpCategory(slug: string): PublicHelpCategory | null {
  const record = CATEGORY_BY_SLUG.get(slug);
  return record ? publishHelpCategory(record) : null;
}

export function articlesInCategory(slug: string): PublicHelpArticle[] {
  return allPublishedArticles().filter((article) => article.category === slug);
}

export function getPublishedArticle(categorySlug: string, articleSlug: string): PublicHelpArticle | null {
  const record = HELP_ARTICLES.find(
    (article) => article.slug === articleSlug && article.category === categorySlug,
  );
  return record ? publishHelpArticle(record) : null;
}

export function getArticleBySlug(articleSlug: string): PublicHelpArticle | null {
  const record = HELP_ARTICLES.find((article) => article.slug === articleSlug);
  return record ? publishHelpArticle(record) : null;
}

/**
 * The shape check.
 *
 * Development only, and deliberately loud: it is the tripwire for somebody adding `internalOwner` to a
 * record and expecting it to cross. The public type would catch that at compile time only if the field were
 * required; this catches it at runtime the moment such a field is spread onto a public object.
 */
function assertPublicShape(article: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'production') return;
  const allowlist = new Set<string>(PUBLIC_ARTICLE_FIELDS);
  const extra = Object.keys(article).filter((key) => !allowlist.has(key));
  if (extra.length > 0) {
    console.warn(
      `[help] public article "${String(article.slug)}" carries fields outside the publication allowlist: ${extra.join(', ')}`,
    );
  }
}

// ── Search ────────────────────────────────────────────────────────────────────────────────────

export type HelpSearchHit = {
  article: PublicHelpArticle;
  /** The first section that matched, so a result can link straight to the answer. */
  anchor: string | null;
  score: number;
};

/** Words too common to carry meaning in this corpus. Not a full stopword list — a short one, kept honest. */
const IGNORED = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'do', 'does', 'for', 'from', 'how',
  'i', 'if', 'in', 'is', 'it', 'its', 'my', 'no', 'not', 'of', 'on', 'or', 'so', 'that', 'the', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'to', 'was', 'what', 'when', 'where', 'which', 'who',
  'why', 'will', 'with', 'you', 'your',
]);

function tokenise(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !IGNORED.has(token));
}

/**
 * Score every published article against a query.
 *
 * ⚠️ EVERY TOKEN HAS TO MATCH SOMEWHERE. A search that ORs its terms returns the whole knowledge base for a
 * two-word query, which reads as "we have nothing specific" while looking like an answer. Requiring all the
 * tokens is stricter and produces fewer, better results; where the strict pass returns nothing the page says
 * so and offers the categories instead of a wall of near-misses.
 *
 * Weights are the only editorial judgement here: a word in the title or in the keyword list is what the
 * article is ABOUT, and a word buried in a paragraph is a word the article merely uses.
 */
/**
 * Whether a query has anything to search with.
 *
 * ⚠️ THIS EXISTS SO A QUERY OF PURE STOPWORDS IS NOT REPORTED AS "NO RESULTS". Somebody who types "how do i"
 * has not asked a question the knowledge base failed to answer — they have not asked one yet, and telling them
 * that nothing matches would be a false statement about the corpus. The hub uses this to decide whether to
 * render a results section at all.
 */
export function isSearchable(query: string): boolean {
  return tokenise(query).length > 0;
}

export function searchHelp(query: string, limit = 12): HelpSearchHit[] {
  const tokens = tokenise(query);
  if (tokens.length === 0) return [];

  const hits: HelpSearchHit[] = [];

  for (const article of allPublishedArticles()) {
    const category = CATEGORY_BY_SLUG.get(article.category);
    const title = article.title.toLowerCase();
    const summary = article.summary.toLowerCase();
    const keywords = article.keywords.join(' ').toLowerCase();
    const categoryText = `${category?.title ?? ''} ${category?.forLine ?? ''}`.toLowerCase();

    let score = 0;
    let matchedEveryToken = true;
    let anchor: string | null = null;

    for (const token of tokens) {
      let tokenScore = 0;
      if (title.includes(token)) tokenScore += 12;
      if (keywords.includes(token)) tokenScore += 7;
      if (summary.includes(token)) tokenScore += 4;
      if (categoryText.includes(token)) tokenScore += 3;

      for (const section of article.sections) {
        const sectionText = `${section.title} ${section.paragraphs.join(' ')} ${(section.bullets ?? []).join(' ')}`.toLowerCase();
        if (section.title.toLowerCase().includes(token)) {
          tokenScore += 5;
          anchor = anchor ?? section.id;
        } else if (sectionText.includes(token)) {
          tokenScore += 1;
          anchor = anchor ?? section.id;
        }
      }

      if (tokenScore === 0) {
        matchedEveryToken = false;
        break;
      }
      score += tokenScore;
    }

    if (matchedEveryToken) hits.push({ article, anchor, score });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title))
    .slice(0, limit);
}

/** The most-visited entries, used as the hub's "start here" list rather than an arbitrary first three. */
export const START_HERE_SLUGS: readonly string[] = [
  'posting-a-request-that-gets-useful-quotes',
  'how-money-is-held-and-released',
  'delivering-work-and-getting-paid',
  'reporting-a-safety-concern',
  'keeping-your-account-secure',
];

export function startHereArticles(): PublicHelpArticle[] {
  return START_HERE_SLUGS.map(getArticleBySlug).filter(
    (article): article is PublicHelpArticle => article !== null,
  );
}

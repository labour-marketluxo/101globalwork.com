/**
 * The policy register — the honest state of every legal document on this platform.
 *
 * ⚠️ NOTHING HERE IS PUBLISHED, AND THAT IS THE POINT.
 *
 * Terms of service, a privacy policy, payment-holding terms and disclaimers are not
 * marketing copy: they are documents that create obligations, and they have to be drafted
 * and reviewed by whoever is accountable for them. Writing them from inside a code change
 * would produce text that LOOKS like a contract and has had no legal review, which is worse
 * for a user than a page that says "not published yet" — a reader would rely on it.
 *
 * So this register carries the structure (slug, title, summary, the sections each policy
 * will have) and a `published: false` flag, exactly the way `FEE_POLICY` carries the fee
 * schedule it does not yet have. The /legal routes render that state explicitly, with the
 * version and last-updated fields present-but-empty, so the day counsel-approved copy
 * arrives it is a content change and not a rebuild.
 *
 * TO PUBLISH A POLICY
 *
 *   1. Fill `sections` with the approved text and set `version` (a date or a semantic
 *      version — the same value the operator will cite in a dispute) and `lastUpdated`.
 *   2. Set `published: true`.
 *   3. The route flips its own `robots` to `index, follow` automatically once ANY policy is
 *      published, and the index page starts listing it as in force.
 *
 * WHAT THE ROUTES POINT AT INSTEAD, for a reader who came looking for an answer today: the
 * published pages about money (/pricing), verification and disputes (/trust-and-safety), and
 * the request process (/how-it-works) are real, maintained and in force. They are not
 * substitutes for a privacy policy, and this file does not pretend otherwise.
 */

export type PolicySection = {
  id: string;
  title: string;
  paragraphs: string[];
};

export type Policy = {
  slug: string;
  title: string;
  /** One line about what this document governs, shown in the register and on the page. */
  summary: string;
  /** False until reviewed text exists. Never flip this to satisfy a checklist. */
  published: boolean;
  /** The value an operator would cite in a dispute. Null while unpublished. */
  version: string | null;
  /** ISO date. Null while unpublished. */
  lastUpdated: string | null;
  /** The sections this policy will contain — the shape of the document, not its text. */
  sections: PolicySection[];
};

const DRAFT_NOTE =
  'This document has not been published. The platform will not present unreviewed text as a policy that is in force, because a reader would be entitled to rely on it.';

export const POLICIES: Policy[] = [
  {
    slug: 'terms',
    title: 'Terms of service',
    summary:
      'The agreement between 101GlobalWork and the people who use it — customers, providers and visitors.',
    published: false,
    version: null,
    lastUpdated: null,
    sections: [
      {
        id: 'scope',
        title: 'Who these terms bind',
        paragraphs: [DRAFT_NOTE],
      },
      {
        id: 'role',
        title: 'The platform’s role',
        paragraphs: [
          '101GlobalWork coordinates: it scopes work, matches requests to verified providers, and holds payment until the work is approved. It does not perform the work, and it is not a party to the agreement between a customer and a provider.',
        ],
      },
      {
        id: 'accounts',
        title: 'Accounts and eligibility',
        paragraphs: ['What is required to hold an account, and what happens when an account is closed.'],
      },
      {
        id: 'changes',
        title: 'Changes to these terms',
        paragraphs: [
          'A published policy will carry its version and the date it took effect, so the text that applied to a given request can be identified afterwards.',
        ],
      },
    ],
  },
  {
    slug: 'privacy',
    title: 'Privacy policy',
    summary:
      'What personal data the platform collects, why, who it is shared with, and how long it is kept.',
    published: false,
    version: null,
    lastUpdated: null,
    sections: [
      {
        id: 'what-we-collect',
        title: 'What is collected',
        paragraphs: [
          'The platform holds account details, the content of requests and messages, and the records needed to process payment. The public side of the product is built on explicit allowlists — a provider profile publishes thirteen fields, and never a phone number, an email address or a street address.',
        ],
      },
      {
        id: 'why',
        title: 'Why it is collected',
        paragraphs: ['To scope work, to match requests with eligible providers, to hold and release payment, and to handle a dispute.'],
      },
      {
        id: 'retention',
        title: 'Retention and deletion',
        paragraphs: [
          'Financial records are retained for as long as the platform is required to keep them. What can be deleted on request, and what cannot, belongs in the published policy rather than in a summary here.',
        ],
      },
      {
        id: 'rights',
        title: 'Your rights',
        paragraphs: ['How to request a copy of your data, correct it, or ask for it to be removed.'],
      },
    ],
  },
  {
    slug: 'payments',
    title: 'Payment holding and release',
    summary:
      'How money is held between an accepted quote and an approved job, and what happens when a job is disputed.',
    published: false,
    version: null,
    lastUpdated: null,
    sections: [
      {
        id: 'holding',
        title: 'Where the money sits',
        paragraphs: [
          'Payments are held by the platform’s payment provider and released after the customer approves the finished work. The platform describes this as money held by its payment provider, not as escrow: escrow is a specific legal arrangement with duties attached to whoever holds the money, and the money is not held by 101GlobalWork.',
        ],
      },
      {
        id: 'release',
        title: 'Release and refunds',
        paragraphs: [
          'A refund is recorded against the original payment, and a refund in flight blocks the provider’s payout until it completes.',
        ],
      },
      {
        id: 'disputes',
        title: 'Disputes',
        paragraphs: [
          'An open dispute blocks the payout. The agreed scope and the itemized quote are the documents reviewed, which is why both are recorded on the request.',
        ],
      },
      {
        id: 'fees',
        title: 'Fees',
        paragraphs: [
          'The fee schedule is not published yet. When it is, it will appear on the pricing page with the date it takes effect rather than inside this policy.',
        ],
      },
    ],
  },
  {
    slug: 'disclaimers',
    title: 'Disclaimers and limitations',
    summary:
      'What the platform does not promise, including the limits of verification and the fact that it is not an emergency service.',
    published: false,
    version: null,
    lastUpdated: null,
    sections: [
      {
        id: 'verification',
        title: 'Verification',
        paragraphs: [
          'Verification is a set of checks with stated limits, not a guarantee of quality or of a particular outcome. Identity is checked before a provider can quote; licences are checked where a trade requires one; insurance is requested where it applies.',
        ],
      },
      {
        id: 'emergency',
        title: 'Not an emergency service',
        paragraphs: [
          'The platform does not respond to emergencies and promises no response time. If anyone is in danger or a property is at immediate risk, contact the appropriate emergency service first.',
        ],
      },
      {
        id: 'content',
        title: 'Guides and other published content',
        paragraphs: [
          'Explanatory pages describe how this platform works. They are not professional advice about a trade, a legal question or a safety procedure, and they are dated so a reader can see when they were last checked.',
        ],
      },
    ],
  },
];

export function getPolicy(slug: string): Policy | undefined {
  const needle = slug.trim().toLowerCase();
  return POLICIES.find((policy) => policy.slug === needle);
}

/** True once any policy is in force — the routes use this to decide their own robots. */
export const anyPolicyPublished = POLICIES.some((policy) => policy.published);

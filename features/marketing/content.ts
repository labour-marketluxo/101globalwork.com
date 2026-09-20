/**
 * Published marketing copy that more than one route quotes verbatim.
 *
 * WHY THIS MODULE EXISTS
 *
 * The taxonomy service pages need a FAQ accordion (the brief asks for one), and
 * this platform does not have service-specific answers to publish — there is no
 * FAQ content table, and inventing trade-specific answers would be exactly the
 * kind of unsupported claim the rest of this codebase refuses to make (see
 * fee-policy.ts and the removed proof-metrics in components/landing).
 *
 * What the platform DOES have is a set of platform-level answers that are already
 * published on /how-it-works: about accounts, cost, verification and disputes.
 * Those are true of any service on the platform, so the service pages reuse them
 * rather than restating them in slightly different words — two copies of the
 * answer to "who checks the providers?" is two copies that can drift, and the one
 * on the service page is the one a customer reads first.
 *
 * MOVED, NOT COPIED: /how-it-works now imports `PLATFORM_FAQS` from here. If an
 * answer needs to change, it changes in one place and both routes move together.
 */

export type FaqItem = { question: string; answer: string };

export const PLATFORM_FAQS: FaqItem[] = [
  {
    question: 'Do I need an account to look for someone?',
    answer:
      'No. Searching, browsing trades and reading provider listings are all public. You sign in to post a request, because the request has to belong to somebody before providers can quote on it.',
  },
  {
    question: 'What does it cost to post a request?',
    answer:
      'Posting is free. Fees are a separate question from the quote, and the fee schedule is published on the pricing page rather than buried in the request flow.',
  },
  {
    question: 'Who checks the providers?',
    answer:
      'Identity is checked before a provider can quote, licences are checked where the trade requires one, and insurance is requested where it applies. The full list of verification types, and what they do not guarantee, is on the trust and safety page.',
  },
  {
    question: 'What happens if the work is not what was quoted?',
    answer:
      'Raise it before you approve. The payment stays held and the provider’s payout is blocked while the dispute is open, and the agreed scope and the itemized quote are the documents that get reviewed.',
  },
  {
    question: 'Can the scope change mid-project?',
    answer:
      'Yes, and it is expected — a fit-out rarely survives first contact. What cannot happen is a change being carried out and then invoiced: a change is re-approved before the work is done.',
  },
];

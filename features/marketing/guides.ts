/**
 * Guides — the platform's own explainers, as data.
 *
 * WHY THESE ARE DATA AND NOT A CMS. There is no articles table, no author table and no
 * editorial workflow in this repository, and adding one would be a product decision far
 * larger than a route. So the guides live here, versioned with the code that renders them,
 * which has a real advantage at this size: a guide cannot drift from the behaviour it
 * describes without the change appearing in the same diff as the behaviour.
 *
 * THE RULE FOR WHAT MAY BE WRITTEN HERE. Every claim has to be true of this platform and
 * already published somewhere else — the request journey on /how-it-works, the verification
 * limits on /trust-and-safety, the fee status on /pricing. Guides are a second way into
 * published facts, not a place to introduce new ones: no timelines, no prices, no "top 10
 * mistakes", no case studies, and nothing that reads like advice about a trade's workmanship.
 * Where a guide touches something the platform does not do yet, it says so and links out.
 *
 * AUTHORSHIP. The author is 101GlobalWork, and the badge on each guide says so. There is no
 * named human author or reviewer in this repository and inventing one — with a face and a
 * job title — is the kind of fabricated proof this codebase has already removed once (see
 * the testimonial and metric removals in components/landing). `reviewedAt` is the date the
 * copy was last checked against the product, which is the claim the badge can actually
 * support.
 */

export type GuideSection = {
  /** Stable anchor, used by the table of contents and the `scroll-mt` target. */
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export type Guide = {
  slug: string;
  title: string;
  summary: string;
  /** ISO date the copy was last checked against the product. */
  reviewedAt: string;
  /** Rough reading time, given the copy above — stated so the reader can decide. */
  readMinutes: number;
  /** Canonical services and problems this guide points at. Market-agnostic. */
  related: { label: string; href: string }[];
  sections: GuideSection[];
};

export const GUIDES: Guide[] = [
  {
    slug: 'how-to-compare-itemized-quotes',
    title: 'How to compare itemized quotes',
    summary:
      'What an itemized quote actually contains, why every provider quotes the same scope, and which lines are worth challenging before you accept one.',
    reviewedAt: '2026-09-20',
    readMinutes: 4,
    related: [
      { label: 'Plumbing', href: '/ng/services/plumbing' },
      { label: 'Tailoring & alterations', href: '/ng/services/tailoring-alterations' },
    ],
    sections: [
      {
        id: 'what-a-quote-contains',
        title: 'What an itemized quote contains',
        paragraphs: [
          'An itemized quote is a list, not a number. Each line states a piece of the work — labour, materials, access, removal — against the scope that was agreed on the request.',
          'The platform asks for lines because a single figure removes the thing you actually need to compare: two quotes for the same job should differ in their numbers, not in what they claim to include.',
        ],
      },
      {
        id: 'same-scope',
        title: 'Why the scope has to be the same',
        paragraphs: [
          'Every provider quoting a request quotes against the scope written on that request. That is what makes the numbers comparable, and it is the reason a request asks you to describe the work rather than name a price bracket.',
          'If a provider wants to change the scope — a different material, a part they found on inspection, work they recommend adding — that is a change to agree before it happens. Nothing is carried out and then invoiced.',
        ],
      },
      {
        id: 'what-to-check',
        title: 'What to check line by line',
        paragraphs: ['Four lines are worth reading twice on any quote:'],
        bullets: [
          'What is excluded. Exclusions decide the final bill more often than the headline figure does.',
          'Anything provisional. A line quoted "if required" is not a commitment, and it is not a reason to skip the rest.',
          'Access and disposal. Getting to the work, and taking away what is removed, are parts of the job.',
          'Who supplies materials. The difference between a quoted part and your own part is a difference in liability.',
        ],
      },
      {
        id: 'what-is-not-published',
        title: 'What the platform does not publish',
        paragraphs: [
          'The fee schedule is not published yet, so no fee figure appears anywhere on this platform — the pricing page states that rather than quoting a rate that has not been agreed.',
          'No customer ratings are published either, because no reviews exist yet. Judging a provider on this platform currently means reading what they have written about their work and what verification has actually checked.',
        ],
      },
    ],
  },
  {
    slug: 'what-verification-covers',
    title: 'What verification covers — and what it does not',
    summary:
      'The checks a provider passes before they can quote, what each one proves, and the things a verified badge is not telling you.',
    reviewedAt: '2026-09-20',
    readMinutes: 4,
    related: [
      { label: 'Trust and safety', href: '/trust-and-safety' },
      { label: 'How it works', href: '/how-it-works' },
    ],
    sections: [
      {
        id: 'identity',
        title: 'Identity',
        paragraphs: [
          'Identity is checked before a provider can quote on a request. That check is what stops an anonymous listing from receiving a job, and it is the first of the gates between a profile and your work.',
          'It confirms who someone is. It is not a character reference, and it does not tell you whether they are good at the work.',
        ],
      },
      {
        id: 'licences-and-insurance',
        title: 'Licences and insurance',
        paragraphs: [
          'Where a trade requires a licence, the licence is checked. Where insurance applies, it is requested.',
          'Neither is universal across trades, which is why verification is described per check rather than as a single guarantee. What was checked for a specific provider is not published per provider yet.',
        ],
      },
      {
        id: 'what-reviews-would-add',
        title: 'What ratings would add, and why there are none',
        paragraphs: [
          'This platform has no reviews table, so no rating is shown anywhere — including on provider profiles, which state the gap rather than filling it with a number.',
          'When reviews exist they will carry the request they came from, so a rating can be traced to completed work. Until then, a star rating here would be a fabrication, not a summary.',
        ],
      },
      {
        id: 'your-side',
        title: 'What you can do regardless',
        paragraphs: ['Verification is one half of the safety of a job. The other half is on the agreement:'],
        bullets: [
          'Keep the scope in writing on the request, rather than in messages.',
          'Raise a concern before you approve the work — payment is held until then, and a dispute blocks the payout while it is open.',
          'Never pay a provider outside the platform for work arranged here: the payment hold and the dispute path only apply to money that went through it.',
        ],
      },
    ],
  },
  {
    slug: 'how-to-describe-work',
    title: 'How to describe work so it can be quoted',
    summary:
      'Why a symptom beats a diagnosis, what to include in the first description, and what to leave for the provider to decide on site.',
    reviewedAt: '2026-09-20',
    readMinutes: 3,
    related: [
      { label: 'Low water pressure', href: '/ng/problems/low-water-pressure' },
      { label: 'A leaking pipe or joint', href: '/ng/problems/leaking-pipe' },
    ],
    sections: [
      {
        id: 'symptoms',
        title: 'Symptoms beat diagnoses',
        paragraphs: [
          'You do not need the trade vocabulary to post a request. "Water under the sink since Tuesday" scopes work better than a guess at which part has failed, because a wrong diagnosis narrows the quote to the wrong fix.',
          'If you do know a term — a tap, a drain, a zip — use it. The request is matched on the meaning, not on the wording.',
        ],
      },
      {
        id: 'what-to-include',
        title: 'What to include',
        paragraphs: ['Five details decide how quotable a description is:'],
        bullets: [
          'What is happening, and where. One room or the whole building changes the scope.',
          'Since when, and whether it is getting worse.',
          'What you have already tried, so a provider does not quote for the same step twice.',
          'When you need it done by, if there is a real constraint. Turnaround is part of the scope.',
          'Anything that affects access: stairs, a locked gate, a tenant, a building that needs notice.',
        ],
      },
      {
        id: 'what-to-leave',
        title: 'What to leave to the provider',
        paragraphs: [
          'You are not expected to price the job, choose the part, or decide what is safe to open. Those are the provider’s work, and they are what the quote is for.',
          'If the cause turns out to be different from what the quote assumed, that is a change to approve before the work happens — not a line added to the invoice afterwards.',
        ],
      },
    ],
  },
];

export function getGuide(slug: string): Guide | undefined {
  const needle = slug.trim().toLowerCase();
  return GUIDES.find((guide) => guide.slug === needle);
}

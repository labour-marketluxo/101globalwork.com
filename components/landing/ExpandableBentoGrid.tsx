'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Droplets, Hammer, Lightbulb, Thermometer, type LucideIcon } from 'lucide-react';

/**
 * ExpandableBentoGrid — interactive category showcase.
 *
 * CLIENT COMPONENT. This is the only reason the `'use client'` directive is
 * here: `useState` for the active card. Keep it as a leaf node and let the
 * page stay a server component.
 *
 * TOKENS: the card colours live in the @theme block in app/globals.css as
 * --color-card-slate / -terracotta / -sage / -amber and --color-brand-dark /
 * -light. Tailwind v4 is CSS-first, so there is no tailwind.config.js to
 * extend — that file is not read by this build.
 *
 * ACCESSIBILITY NOTE — measured, not assumed. Using the WCAG relative
 * luminance formula:
 *
 *   card 0  #1E293B + white        ~13.0:1   passes AA
 *   card 1  #D96B43 + white         ~3.4:1   fails AA for small text
 *   card 2  #6B9080 + white         ~3.5:1   fails AA for small text
 *   card 3  #E5AD35 + brand-dark    ~9.1:1   passes AA
 *
 * The bold titles are large text, so 3:1 is enough for them. The DESCRIPTION
 * copy is small, so cards 1 and 2 currently under-deliver. Swapping those two
 * to `text-brand-dark` keeps the specified colours and fixes it:
 *   #D96B43 + #0B132B = ~5.4:1, #6B9080 + #0B132B = ~5.2:1
 * Left as specified pending that decision; it is a one-word change per card.
 *
 * ASSETS: no cut-out product photography exists in this repository yet. Each
 * card accepts an optional `image`; when it is absent the badge icon is scaled
 * up into the same slot so the reveal animation is identical. Point `image` at
 * a real asset to switch to <Image>.
 */

type BentoCard = {
  id: string;
  badge: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Tailwind background utility for this card's surface. */
  surface: string;
  /** Tailwind text utility, contrast-matched to `surface`. */
  text: string;
  /** Badge/asset tile background, tuned per surface. */
  tile: string;
  /** Optional cut-out asset. Falls back to the scaled-up icon. */
  image?: string;
};

/**
 * MOCK DATA. These four trades are illustrative — only `plumbers` has a
 * published public_routes leaf today, and there is no `/services/<slug>` route,
 * so every card routes to the search entry point, which always resolves.
 */
const CARDS: BentoCard[] = [
  {
    id: 'shelving',
    badge: 'Carpentry',
    title: 'Custom Shelving',
    description: 'Fitted wardrobes, alcove units and storage built to the exact space you have.',
    href: '/search?service=carpentry-roofing',
    icon: Hammer,
    surface: 'bg-card-slate',
    text: 'text-white',
    tile: 'bg-white/10',
  },
  {
    id: 'thermostat',
    badge: 'Smart Home',
    title: 'Thermostat & Smart Home',
    description: 'Heating controls, sensors and connected devices installed and configured.',
    href: '/search?service=electricians',
    icon: Thermometer,
    surface: 'bg-card-terracotta',
    text: 'text-white',
    tile: 'bg-white/15',
  },
  {
    id: 'leak',
    badge: 'Plumbing',
    title: 'Leak Detection & Plumbing',
    description: 'Trace hidden leaks, repair pipework and restore pressure without guesswork.',
    href: '/search?service=plumbers',
    icon: Droplets,
    surface: 'bg-card-sage',
    text: 'text-white',
    tile: 'bg-white/15',
  },
  {
    id: 'lighting',
    badge: 'Electrical',
    title: 'Lighting & Electrical',
    description: 'Lighting design, rewires, fault finding and certification for your premises.',
    href: '/search?service=electricians',
    icon: Lightbulb,
    surface: 'bg-card-amber',
    text: 'text-brand-dark',
    tile: 'bg-brand-dark/10',
  },
];

export default function ExpandableBentoGrid() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-16">
      <h2 className="text-2xl font-bold tracking-tight text-text-main">Browse by category</h2>
      <p className="mt-1 text-text-muted">
        The trades we are onboarding first. Open a card to see the kind of work involved.
      </p>

      <ul className="mt-6 flex min-h-[420px] w-full list-none flex-col gap-4 p-0 md:flex-row">
        {CARDS.map((card, index) => {
          const isActive = index === activeIndex;
          const Icon = card.icon;

          return (
            <li
              key={card.id}
              className={`transition-all duration-500 ease-in-out motion-reduce:transition-none ${
                isActive ? 'md:flex-[2.5]' : 'md:flex-1'
              }`}
            >
              <Link
                href={card.href}
                // Only the pointer needs this; focus is handled below so the
                // same expansion is reachable from the keyboard.
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                aria-label={`${card.title} — browse providers`}
                className={`flex h-full w-full items-stretch gap-4 overflow-hidden rounded-lg p-5 no-underline transition-colors ${card.surface} ${card.text}`}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${card.tile}`}
                  >
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>

                  <p className="mt-4 text-xs font-semibold tracking-widest uppercase opacity-80">
                    {card.badge}
                  </p>
                  <h3 className="mt-1 text-xl font-bold tracking-tight">{card.title}</h3>
                  <p className="mt-2 max-w-sm text-sm opacity-90">{card.description}</p>
                </div>

                {/*
                  Revealed asset. Hidden below md because the layout stacks into
                  a single column there and a right-hand asset would be cramped.

                  The `md:w-0` → `md:w-44` width transition is LOAD-BEARING, not
                  cosmetic. A fixed-width asset (the obvious implementation)
                  gives every collapsed card a ~300px min-content floor, which
                  consumes the row's free space and leaves `flex-grow` nothing to
                  distribute — so the active card ends up no wider than the rest.
                  Collapsing the tile to zero gives the flex-grow room to work.
                  `overflow-hidden` on this element is also required: without it
                  the tile still contributes its content's min-content width and
                  the floor comes back.

                  TODO: replace the scaled icon with <Image src={card.image} … />
                  once cut-out product assets are added to /public.
                */}
                <div
                  aria-hidden="true"
                  className={`hidden shrink-0 items-center justify-center overflow-hidden transition-all duration-500 ease-in-out motion-reduce:transition-none md:flex ${
                    isActive ? 'translate-x-0 opacity-100 md:w-44' : 'translate-x-8 opacity-0 md:w-0'
                  }`}
                >
                  <Icon className="h-24 w-24" strokeWidth={1.25} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

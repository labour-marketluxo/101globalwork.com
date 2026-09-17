import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * TradeVerticals — the dark deep-teal section of photographed category cards.
 *
 * Ported from the design's section 3. The cards, the image treatment (gradient
 * from `primary-dark`, slow scale on hover) and the mono tag chips all match.
 *
 * TWO DEPARTURES
 *
 * Categories follow the platform's own public service list — the same four
 * services already used by SearchWizard and InteractivePhotoCards — rather than
 * the design's (Structural & Roofing / High-Voltage Electrical / Industrial HVAC
 * / IT & Telecoms). The seeded taxonomy in supabase/migrations currently holds
 * only `plumbing_residential` and `tailoring_alterations`, so advertising
 * structural engineering or fibre splicing would promise supply that does not
 * exist yet.
 *
 * The image badges are gone. The design overlaid each photo with "248 Crews" and
 * "Avg: 38m" — invented supply counts and invented response times, sitting on the
 * most trust-sensitive part of the page. The chips in the card body already carry
 * the category detail, so nothing is lost but the fabrication.
 *
 * PHOTOGRAPHY: these are the design's stock trade images, vendored into
 * public/images/landing. Only the electrical and HVAC shots genuinely depict
 * their category — the plumbing and cleaning cards are running on generic trade
 * imagery. `alt=""` is deliberate until matching assets exist: describing a
 * photograph of a fibre splicer as a deep clean would be worse than saying
 * nothing, and the card heading already carries the meaning.
 */

const VERTICALS = [
  {
    slug: 'Plumbing',
    title: 'Plumbing',
    photo: '/images/landing/vertical-structural.jpg',
    blurb: 'Leaks, blocked drains, taps, pipework, fittings and water pressure.',
    tags: ['Leaks', 'Drainage', 'Fittings'],
  },
  {
    slug: 'Electrical',
    title: 'Electrical',
    photo: '/images/landing/vertical-electrical.jpg',
    blurb: 'Fault finding, rewiring, sockets, inverters and distribution boards.',
    tags: ['Fault finding', 'Rewiring', 'Inverters'],
  },
  {
    slug: 'Air conditioning',
    title: 'Air conditioning & HVAC',
    photo: '/images/landing/vertical-hvac.jpg',
    blurb: 'Installation, servicing, gas refill and compressor faults.',
    tags: ['Installation', 'Servicing', 'Gas refill'],
  },
  {
    slug: 'Home cleaning',
    title: 'Home cleaning',
    photo: '/images/landing/vertical-it.jpg',
    blurb: 'Deep cleans, move-in and move-out, and recurring office cleaning.',
    tags: ['Deep clean', 'Move-out', 'Offices'],
  },
];

export default function TradeVerticals() {
  return (
    <section id="verticals" className="w-full scroll-mt-24 bg-primary py-24 text-white">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mb-14 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 font-mono text-xs font-semibold tracking-wider text-amber-300 uppercase">
              Verified service categories
            </span>
            <h2 className="mt-3 mb-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Specialists you can actually verify
            </h2>
            <p className="text-sm text-slate-300 sm:text-base">
              Every provider is checked before they can quote — identity, the licence their trade
              requires, and the details you need to decide.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-primary-dark px-4 py-2.5 font-mono text-xs text-slate-300">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Reviewed before a quote can be sent</span>
          </div>
        </div>

        {/* Category cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {VERTICALS.map((vertical) => (
            <div
              key={vertical.slug}
              className="group flex flex-col justify-between overflow-hidden rounded-xl border border-white/10 bg-primary-dark transition-all hover:border-secondary/50 hover:shadow-2xl"
            >
              <div>
                <div className="relative h-48 w-full overflow-hidden bg-slate-800">
                  <Image
                    src={vertical.photo}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary-dark via-primary-dark/20 to-transparent" />
                </div>

                <div className="p-5">
                  <h3 className="mb-2 text-base font-bold text-white transition-colors group-hover:text-amber-300">
                    {vertical.title}
                  </h3>
                  <p className="mb-4 text-xs leading-relaxed text-slate-300">{vertical.blurb}</p>
                  <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                    {vertical.tags.map((tag) => (
                      <span key={tag} className="rounded-sm bg-white/10 px-2 py-0.5 text-slate-200">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-5 pt-0">
                <Link
                  href={`/search?q=${encodeURIComponent(vertical.slug)}`}
                  className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-amber-300 no-underline transition-all hover:text-amber-200 group-hover:gap-2"
                >
                  See providers
                  <ArrowRight aria-hidden="true" className="h-[15px] w-[15px]" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

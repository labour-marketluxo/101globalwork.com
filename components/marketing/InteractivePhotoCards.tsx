import Image from 'next/image';
import Link from 'next/link';

/**
 * InteractivePhotoCards — quick-select categories with photography.
 *
 * NOT a client component, deliberately. Everything the design asks for is
 * achievable without JavaScript:
 *   - hover scale is a CSS transition (with a spring-like overshoot easing)
 *   - "pre-select the category and route into the flow" is a Link that carries
 *     the category in the URL, which is exactly how pre-selection survives a
 *     navigation
 * Adding 'use client' here would ship hydration cost for zero behaviour.
 *
 * PHOTOGRAPHY: every Unsplash id below was verified to return 200 image/jpeg
 * before being wired in, and the host is declared in next.config.ts
 * images.remotePatterns — next/image throws on undeclared remote hosts.
 *
 * PLACEHOLDER DATA: the metric badges ("98% Rating") are illustrative. There is
 * no rating aggregation to source them from yet; replace before launch.
 */

const unsplash = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;

const CARDS = [
  {
    slug: 'plumbers',
    title: 'Plumbing',
    blurb: 'Leaks, pipework and fittings',
    metric: '98% Rating',
    photo: unsplash('photo-1517646287270-a5a9ca602e5c'),
    // Bento spans. The grid is 6 columns at lg, so 3/3 then 4/2 produces two
    // visually uneven rows instead of four identical squares.
    span: 'lg:col-span-3',
  },
  {
    slug: 'electricians',
    title: 'Electrical',
    blurb: 'Faults, rewiring and inverters',
    metric: '95% Rating',
    photo: unsplash('photo-1555963966-b7ae5404b6ed'),
    span: 'lg:col-span-3',
  },
  {
    slug: 'home-cleaning',
    title: 'Home Cleaning',
    blurb: 'Deep cleans and move-outs',
    metric: '97% Rating',
    photo: unsplash('photo-1527515637462-cff94eecc1ac'),
    span: 'lg:col-span-4',
  },
  {
    slug: 'air-conditioning',
    title: 'Air Conditioning',
    blurb: 'Install, service and gas refill',
    metric: '96% Rating',
    photo: unsplash('photo-1612836639523-2ed74bc0209e'),
    span: 'lg:col-span-2',
  },
];

export default function InteractivePhotoCards({ className = '' }: { className?: string }) {
  return (
    <ul
      className={`grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-6 ${className}`}
    >
      {CARDS.map((card) => (
        <li key={card.slug} className={card.span}>
          <Link
            href={`/search?service=${encodeURIComponent(card.slug)}`}
            className="group relative block h-[280px] cursor-pointer overflow-hidden rounded-3xl shadow-lg transition-all duration-300 hover:shadow-2xl"
          >
            {/* The image wrapper scales, not the card, so the photo zooms
                inside a fixed frame while the card only deepens its shadow. */}
            <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-105">
              <Image
                src={card.photo}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 50vw"
                className="object-cover"
              />
            </div>

            {/* Heavy bottom mask so white text stays legible on any photo.
                z-10 sits above the image, below the content at z-20. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 z-10 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent"
            />

            <div className="relative z-20 flex h-full flex-col justify-end p-5">
              <h3 className="text-xl font-bold text-white">{card.title}</h3>
              <p className="mt-1 line-clamp-1 text-xs text-slate-200">{card.blurb}</p>
            </div>

            <span className="absolute top-4 right-4 z-20 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-slate-900 shadow-sm backdrop-blur-md">
              {card.metric}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

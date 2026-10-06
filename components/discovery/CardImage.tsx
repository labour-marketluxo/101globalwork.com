import Image from 'next/image';

/**
 * Card artwork for the discovery cards.
 *
 * ⚠️ THIS IS THE INPUT POINT FOR IMAGES. The catalogue has no image column, so card art lives
 * here: drop the file under `public/images/` and map it to the entity's key. Keys are the
 * catalogue's `canonical_key` for services and categories (e.g. `plumbing_residential`,
 * `home_property_maintenance`), plus the two symbolic keys for the provider page's fact cards,
 * which have no catalogue row of their own. Anything unmapped keeps the grey placeholder, so a
 * half-filled set still renders.
 */
export const CARD_ART: Record<string, string> = {
  // plumbing_residential: '/images/services/plumbing.jpg',
  // home_property_maintenance: '/images/categories/home-property.jpg',
  // 'provider:service': '/images/providers/canonical-service.jpg',
  // 'provider:area': '/images/providers/based-in.jpg',
};

/**
 * The picture block at the head of a discovery card.
 *
 * Full-bleed on purpose: it runs to the card's left and right edges and the card's own
 * `overflow-hidden` clips it to the corners, so the art is not inset by the content padding. The
 * grey block is the design's placeholder and stays until the key is mapped above.
 */
export function CardImage({ artKey }: { artKey?: string | null }) {
  const src = artKey ? CARD_ART[artKey] : undefined;

  return (
    <div className="relative aspect-[16/9] w-full bg-slate-200">
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
      ) : null}
    </div>
  );
}

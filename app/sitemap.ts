import type { MetadataRoute } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { allHelpCategories, allPublishedArticles } from '@/features/help/knowledge-base';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://101globalwork.com';
  const entries: MetadataRoute.Sitemap = [
    {
      url: site,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    // The static public marketing routes. Listed explicitly because nothing
    // generates them: this sitemap appends database rows to the homepage, and a
    // route that only exists in code would otherwise never be advertised. All
    // three are indexable (see their `robots` metadata) and always present, which
    // is the bar for being listed here — the comment on the catch block below
    // applies to these too.
    ...['/how-it-works', '/pricing', '/trust-and-safety'].map((path) => ({
      url: new URL(path, site).toString(),
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),

    /**
     * The help centre: the hub, its six sections and every PUBLISHED article.
     *
     * Listed from the content module rather than from a hand-written array, for the reason the whole knowledge
     * base is built the way it is — `allPublishedArticles()` is the same function the routes, the search and the
     * article pages use, so a draft cannot be advertised in a sitemap that a page would refuse to serve, and a
     * new article cannot be published without appearing here.
     *
     * `lastModified` on an article is its review date, which is the only date this platform records about it.
     * That is a real claim — the copy was checked against the product on that day — rather than the
     * `new Date()` that the marketing routes above use, which only says when the sitemap was generated.
     */
    {
      url: new URL('/help', site).toString(),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...allHelpCategories().map((category) => ({
      url: new URL(category.href, site).toString(),
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...allPublishedArticles().map((article) => ({
      url: new URL(article.href, site).toString(),
      lastModified: new Date(article.reviewedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('public_sitemap_entries')
      .select('canonical_path,updated_at');

    if (error) throw error;

    for (const row of data ?? []) {
      entries.push({
        url: new URL(row.canonical_path, site).toString(),
        lastModified: row.updated_at ? new Date(row.updated_at) : undefined,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
  } catch {
    // Safe fallback: homepage only. Never emit unverified or non-indexable URLs.
  }

  return entries;
}

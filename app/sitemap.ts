import type { MetadataRoute } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://101globalwork.com';
  const entries: MetadataRoute.Sitemap = [
    {
      url: site,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
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

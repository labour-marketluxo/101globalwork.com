import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://101globalwork.com';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        /**
         * `/search` alone does NOT cover the market-scoped search page: these are
         * literal prefixes, not patterns, so `/{market}/search` needed its own
         * entry — the wildcard form below matches it at any market depth. Both
         * routes also declare `robots: { index: false }` in their own metadata;
         * this is the belt to that pair of braces, kept because crawl budget spent
         * on parameterised URLs is waste even when the pages are noindex.
         */
        disallow: ['/search', '/*/search', '/account', '/work', '/api'],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}

import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://101globalwork.com';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/search', '/account', '/work', '/api'],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}

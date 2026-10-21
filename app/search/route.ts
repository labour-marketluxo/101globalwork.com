import { NextResponse, type NextRequest } from 'next/server';
import { getDefaultMarketSlug } from '@/features/discovery/data/market-catalog';

/**
 * `/search` — redirect only. There is no search page at this path any more.
 *
 * WHY THIS FILE STILL EXISTS
 *
 * Search is market-scoped now: `/{market}/search` is the only place a result set is
 * rendered, and every link and form in the app points there. That leaves the bare
 * `/search` path with no page — and a real population of URLs already pointing at it:
 * the old footer and hero links, anything anyone bookmarked, and anything a crawler
 * has already recorded. Deleting the page and letting the path 404 would throw all of
 * that away; this answers with a 307 to the same destination the rest of the app uses,
 * query string intact, so `/search?q=leaking+tap` still lands on a working result set.
 *
 * It resolves the market at RUNTIME from the catalog rather than hardcoding it in
 * `next.config.ts` redirects, so the target cannot drift from `getDefaultMarketSlug`
 * — the same function the footer and the landing hero use.
 *
 * 307, not 308: the default market is configuration and can change, and a permanent
 * redirect would make that change very hard to undo in caches and indexes. The path is
 * still listed as disallowed in robots.txt, so this is for humans and for link
 * equity, not for crawl discovery.
 *
 * If a hard 404 is wanted instead, delete this file — nothing imports it.
 */
export async function GET(request: NextRequest) {
  const marketSlug = await getDefaultMarketSlug();
  const target = new URL(`/${marketSlug}/search`, request.nextUrl.origin);

  // Carry every parameter through untouched: `q`, `category`, `area`,
  // `availability`, `sort` are all read by the market search page.
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });

  return NextResponse.redirect(target, 307);
}

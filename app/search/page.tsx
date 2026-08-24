import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Find help',
  robots: { index: false, follow: true },
};

type SearchPageProps = {
  searchParams: Promise<{ q?: string; location?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const need = params.q?.trim() ?? '';
  const location = params.location?.trim() ?? '';

  return (
    <section className="content-shell">
      <p className="eyebrow">Find the right help</p>
      <h1>{need ? `Help with “${need}”` : 'Tell us what you need done'}</h1>
      <p className="lede left">
        {location
          ? `We’ll use ${location} to narrow eligible services and providers.`
          : 'Add a location so we can show relevant services and providers.'}
      </p>
      <div className="notice">
        <strong>Next step:</strong> We’ll ask only the details needed to create a clear request. Complex projects can expand later.
      </div>
      <form className="stack-form" action="/search" method="get">
        <label htmlFor="need">What do you need done?</label>
        <textarea id="need" name="q" required defaultValue={need} rows={4} placeholder="Describe the problem or outcome" />
        <label htmlFor="location">Where is the work?</label>
        <input id="location" name="location" defaultValue={location} placeholder="Area, city or locality" />
        <button type="submit">Continue</button>
      </form>
    </section>
  );
}

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Find help', robots: { index: false, follow: true } };

type SearchPageProps = { searchParams: Promise<{ q?: string; location?: string }> };

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const need = params.q?.trim() ?? '';
  const location = params.location?.trim() ?? '';

  return <section className="content-shell">
    <p className="eyebrow">Find the right help</p>
    <h1>{need ? `Help with “${need}”` : 'Tell us what you need done'}</h1>
    <p className="lede left">{location ? `You said the work is around ${location}. Confirm the canonical service and location next so matching stays accurate.` : 'Confirm the service and location next so matching stays accurate.'}</p>
    <div className="notice"><strong>Next step:</strong> Create a private request. We only ask for structured details needed to match eligible providers.</div>
    <form className="stack-form" action="/requests/new" method="get">
      <label htmlFor="need">What do you need done?</label>
      <textarea id="need" name="q" required defaultValue={need} rows={4} placeholder="Describe the problem or outcome" />
      <button type="submit">Continue to request</button>
    </form>
  </section>;
}

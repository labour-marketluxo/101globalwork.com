export default function HomePage() {
  return (
    <section className="hero">
      <p className="eyebrow">101GlobalWork</p>
      <h1>What do you need done?</h1>
      <p className="lede">Describe the work. We’ll help you find the right service and trusted providers near you.</p>
      <form className="need-form" action="/search" method="get">
        <label htmlFor="need" className="sr-only">What do you need done?</label>
        <input id="need" name="q" required placeholder="e.g. Fix a leaking pipe" autoComplete="off" />
        <label htmlFor="location" className="sr-only">Location</label>
        <input id="location" name="location" placeholder="Your area or city" autoComplete="address-level2" />
        <button type="submit">Find help</button>
      </form>
      <p className="hint">Simple jobs stay simple. For complex work, we’ll guide you step by step.</p>
    </section>
  );
}

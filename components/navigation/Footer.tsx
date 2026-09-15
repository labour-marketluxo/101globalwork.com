/**
 * Footer — the site footer.
 *
 * Extracted verbatim from the root layout. The year is evaluated during the
 * server render, exactly as before, so the output is unchanged.
 *
 * The admin layout hides it via its injected `body > footer` rule; that still
 * matches because this component adds no wrapper element — the rendered
 * <footer> remains a direct child of <body>.
 */
export default function Footer() {
  return <footer>© {new Date().getFullYear()} 101GlobalWork</footer>;
}

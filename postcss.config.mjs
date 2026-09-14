/**
 * PostCSS configuration.
 *
 * Tailwind CSS v4 is wired in through `@tailwindcss/postcss`. The plugin
 * bundles its own import resolver and Lightning CSS transform (vendor
 * prefixing, nesting, modern syntax lowering), so no separate `autoprefixer`
 * or `postcss-import` entry is required.
 *
 * Tailwind configuration is CSS-first: theme tokens and content sources live
 * in `app/globals.css`. There is deliberately no `tailwind.config.js/ts`.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;

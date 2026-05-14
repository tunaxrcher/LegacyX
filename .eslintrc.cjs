/**
 * Root ESLint config for the LegacyX monorepo.
 *
 * - Uses `eslint-config-next` (Next.js + React + TypeScript rules in one bundle)
 *   for all three Next.js apps (api-server, backoffice-web, patient-app).
 * - The worker-engine / ai-service / packages/* are pure TS Node code and
 *   share the same TypeScript rules from this same config.
 * - Apps may override via their own `.eslintrc.json` if needed.
 *
 * Pinned at ESLint v8 because `eslint-config-next@14` does not yet support
 * the v9 flat-config API.
 */
module.exports = {
  root: true,
  // Don't try to crawl outside the workspace.
  ignorePatterns: [
    "**/.next/**",
    "**/.turbo/**",
    "**/dist/**",
    "**/node_modules/**",
    "**/coverage/**",
    "**/storage/**",
    "**/public/**",
    "infra/**",
    "scripts/**",
    "packages/db/prisma/**", // generated client + schema artefacts
  ],
  extends: ["next/core-web-vitals"],
  rules: {
    // Allow `_unused` arg/var convention (matches our codebase).
    // Use plain `no-unused-vars` because eslint-config-next only loads the
    // typescript-eslint plugin per-file via Next's own resolver, not globally.
    "no-unused-vars": "off",
    // We use `<a>` for download links / external — Next.js complains only for
    // internal links, which we already migrate to <Link> where appropriate.
    "@next/next/no-html-link-for-pages": "off",
    // We legitimately use raw <img> in the patient-app PWA shell (no <Image>
    // because the LIFF browser doesn't support next/image edge transforms).
    "@next/next/no-img-element": "off",
    // We import server-only utilities into server-action files; Next's
    // sync-script rule isn't relevant for our cases.
    "react/no-unescaped-entities": "off",
  },
  overrides: [
    {
      // Server-side code shouldn't trigger React hook lint. The api-server is
      // a Next.js app but contains only route handlers — no React components.
      files: [
        "apps/api-server/**/*.{ts,tsx}",
        "apps/worker-engine/**/*.{ts,js}",
        "apps/ai-service/**/*.{ts,js}",
        "packages/**/*.{ts,js}",
        "**/route.ts",
        "**/actions.ts",
        "**/*.service.ts",
      ],
      rules: {
        "react-hooks/rules-of-hooks": "off",
        "react-hooks/exhaustive-deps": "off",
        "@next/next/no-html-link-for-pages": "off",
      },
    },
  ],
};

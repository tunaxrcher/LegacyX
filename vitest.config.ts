import { defineConfig } from "vitest/config";

/**
 * Root Vitest configuration.
 *
 * Each package can override individual settings via its own
 * `vitest.config.ts`, but most pure-logic units (events schemas, AI provider
 * heuristics, util helpers) live under `**\/__tests__\/*.test.ts` and pick
 * this config up by default.
 *
 * We deliberately exclude e2e / DB-dependent specs from the default run so
 * `pnpm test` is fast and CI-safe without spinning up MySQL / Redis.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/integration/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
        "**/__tests__/**",
        "**/*.config.*",
      ],
    },
  },
});

import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow Server Actions through the Windsurf / IDE browser-preview proxy
    // (random 127.0.0.1:<port>) and direct localhost in dev.
    // - `SERVER_ACTIONS_ALLOWED_ORIGINS` env (comma-sep) extends the allowlist
    //   for explicit dev or production hosts.
    // - In dev we additionally accept any localhost / 127.0.0.1 port via the
    //   ephemeral range below. This is OK because dev only listens locally.
    serverActions: {
      allowedOrigins: [
        "localhost:3003",
        "127.0.0.1:3003",
        ...(process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        // Dev-only: ephemeral ports for browser preview / IDE proxies. ~64k
        // strings is ~2MB in memory — fine for dev, never shipped to prod.
        ...(process.env.NODE_ENV !== "production"
          ? [
              ...Array.from(
                { length: 65535 - 1024 },
                (_, i) => `127.0.0.1:${i + 1024}`,
              ),
              ...Array.from(
                { length: 65535 - 1024 },
                (_, i) => `localhost:${i + 1024}`,
              ),
            ]
          : []),
      ],
    },
  },
};

export default withNextIntl(nextConfig);

import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3004",
        "127.0.0.1:3004",
        ...(process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
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
  /** PWA-friendly headers — manifest + service worker scope. */
  async headers() {
    return [
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "content-type", value: "application/manifest+json" },
          { key: "cache-control", value: "public, max-age=3600" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "content-type", value: "application/javascript" },
          { key: "cache-control", value: "no-cache" },
          { key: "service-worker-allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

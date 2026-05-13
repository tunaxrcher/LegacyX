/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "@legacyx/db"],
  },
  transpilePackages: ["@legacyx/events", "@legacyx/types"],
  poweredByHeader: false,
  logging: {
    fetches: { fullUrl: false },
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "@legacyx/db"],
  },
  transpilePackages: ["@legacyx/events"],
  poweredByHeader: false,
  logging: {
    fetches: { fullUrl: false },
  },
};

export default nextConfig;

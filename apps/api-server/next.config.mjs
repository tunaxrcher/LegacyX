/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Pull in the Prisma engine .node binary + generated client files when
  // building the standalone output. Without this, Next.js file tracing skips
  // the dynamically-loaded engine binary and the runtime fails with
  // "Prisma Client could not locate the Query Engine for runtime ...".
  //
  // The globs walk both flat and pnpm-symlinked node_modules layouts.
  outputFileTracingIncludes: {
    "/**/*": [
      "../../node_modules/**/.prisma/**/*",
      "../../node_modules/**/@prisma/client/**/*",
    ],
  },
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

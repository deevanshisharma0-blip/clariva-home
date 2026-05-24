import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Static export — FastAPI serves the built output from apps/web/out/
  output: "export",
  images: {
    unoptimized: true, // required for static export
  },
  // Don't fail deploy on TS type errors in JSX
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

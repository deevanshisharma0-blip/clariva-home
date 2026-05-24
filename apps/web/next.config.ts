import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Static export — FastAPI serves the built output from apps/web/out/
  output: "export",
  images: {
    unoptimized: true, // required for static export
  },
};

export default nextConfig;

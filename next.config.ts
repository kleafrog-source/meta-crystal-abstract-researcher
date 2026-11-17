import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The canonical build script runs the full project typecheck first. Avoid running
  // a second in-process checker during webpack compilation (it exceeded the Node heap).
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    webpackMemoryOptimizations: true,
  },
  reactStrictMode: false,
};

export default nextConfig;

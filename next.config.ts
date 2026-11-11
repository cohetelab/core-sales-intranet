import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 2,
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;

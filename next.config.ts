import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Required documents are capped at 10 MB; leave headroom for multipart overhead.
      bodySizeLimit: "12mb",
    },
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

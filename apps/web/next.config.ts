import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mirujima/contracts"],
  poweredByHeader: false
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "t.me",
        pathname: "/i/userpic/**",
      },
    ],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Pin the workspace root to this app dir. Without it, the root-level
  // package-lock.json (dev tooling) makes Next infer the wrong root, breaking
  // the @/* alias when deps are only installed in this app (e.g. CI).
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    viewTransition: true,
  },
  images: {
    qualities: [100, 75],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        pathname: '/vi/**',
      },
    ],
  },
  reactCompiler: true,
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;

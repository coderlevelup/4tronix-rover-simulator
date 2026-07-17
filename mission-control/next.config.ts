import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Self-contained server bundle for the Cloud Run container: the Dockerfile
  // copies .next/standalone (plus .next/static and public/) into a slim
  // runtime image and starts server.js, which honors $PORT.
  output: 'standalone',
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Prevent Next.js from bundling native binaries and server-only Node modules.
  // ffmpeg-static and ffprobe-static ship OS-specific executables (78+ MB) that
  // cannot be bundled by webpack. They are only used in the local render worker,
  // never on Vercel's edge/serverless functions.
  serverExternalPackages: [
    "ffmpeg-static",
    "ffprobe-static",
    "child_process",
  ],

  // Vercel function configuration (ignored locally, respected on Vercel Pro/Enterprise)
  // The render route is NOT on Vercel — it uses an external HttpWorkerClient when
  // WORKER_BASE_URL is set. Only metadata/status actions run inside Vercel functions.
  experimental: {
    // No experimental flags needed for current feature set.
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Set to false because strict mode breaks components that call APIs when the component is rendered (like in Conversation)
  reactStrictMode: false,
  output: "standalone",
  experimental: {
    authInterrupts: true,
  },
  eslint: {
    // Disable ESLint during builds to avoid native binding issues on Vercel
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

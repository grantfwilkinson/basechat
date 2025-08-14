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
  webpack: (config, { isServer }) => {
    // Fix for Google Cloud Tasks JSON configuration files on Vercel
    if (isServer) {
      // Ensure Google Cloud Tasks config files are included in the build
      config.resolve.alias = {
        ...config.resolve.alias,
        // Force webpack to resolve the CJS version instead of ESM to avoid the JSON file issue
        "@google-cloud/tasks": "@google-cloud/tasks/build/src/index.js",
      };
    }
    return config;
  },
};

export default nextConfig;

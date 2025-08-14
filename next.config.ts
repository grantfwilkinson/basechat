import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Set to false because strict mode breaks components that call APIs when the component is rendered (like in Conversation)
  reactStrictMode: false,
  output: "standalone",
  experimental: {
    authInterrupts: true,
    serverComponentsExternalPackages: ["@google-cloud/tasks"],
  },
  eslint: {
    // Disable ESLint during builds to avoid native binding issues on Vercel
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    // Fix for Google Cloud Tasks JSON configuration files on Vercel
    if (isServer) {
      // Don't bundle @google-cloud/tasks, let it be handled at runtime
      config.externals = config.externals || [];
      config.externals.push("@google-cloud/tasks");
    }
    return config;
  },
};

export default nextConfig;

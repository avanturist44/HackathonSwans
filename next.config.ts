import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything runs locally against the user's own Clio account.
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;

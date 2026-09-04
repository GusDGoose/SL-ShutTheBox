import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The new-game screen moved to /play. Teams cards and bookmarks from v1
      // still point at the old path.
      { source: "/game/new", destination: "/play", permanent: true },
    ];
  },
};

export default nextConfig;

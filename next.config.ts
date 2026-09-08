import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Actions default to a 1 MB body. Photos arrive at ~1 MB after the
      // browser resizes them and song clips may be up to 4 MiB; the extra
      // headroom is for multipart boundaries and headers.
      bodySizeLimit: "5mb",
    },
  },
  async redirects() {
    return [
      // The new-game screen moved to /play. Teams cards and bookmarks from v1
      // still point at the old path.
      { source: "/game/new", destination: "/play", permanent: true },
    ];
  },
};

export default nextConfig;

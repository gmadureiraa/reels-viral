import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { hostname: "**.cdninstagram.com" },
      { hostname: "**.fbcdn.net" },
      { hostname: "scontent*.cdninstagram.com" },
    ],
  },
};

export default config;

import type { NextConfig } from "next";

const config: NextConfig = {
  async redirects() {
    return [{ source: "/keys", destination: "/wallet", permanent: true }];
  },
};

export default config;

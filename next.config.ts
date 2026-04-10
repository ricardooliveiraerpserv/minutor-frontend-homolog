import type { NextConfig } from "next";

const BACKEND_URL = 'https://minutor-backend-production.up.railway.app'

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${BACKEND_URL}/api/v1/:path*`,
      },
    ]
  },
};

export default nextConfig;

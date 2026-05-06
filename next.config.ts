import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

// Detecta homolog automaticamente pelo BACKEND_URL — não requer configuração manual no Render
const APP_ENV = BACKEND_URL.includes('onrender.com') ? 'homolog' : 'production'

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  env: {
    NEXT_PUBLIC_APP_ENV: APP_ENV,
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

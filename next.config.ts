import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/workshop/inspection-reports/generate': [
      './assets/fonts/NotoSans-Regular.ttf',
      './assets/fonts/NotoSans-Bold.ttf',
      './assets/fonts/**/*.ttf',
      './node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf'
    ]
  },
  experimental: {
    serverActions: {
      // Keep a sane cap for non-file payloads; avatar binaries should use direct upload.
      bodySizeLimit: '2mb'
    }
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }]
  }
};

export default nextConfig;

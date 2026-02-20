import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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

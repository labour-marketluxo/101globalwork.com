import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: { optimizePackageImports: ['@supabase/supabase-js'] },
  images: {
    /**
     * The landing-page gateway renders Unsplash photography through next/image.
     * Remote hosts must be declared here or the optimiser rejects them at
     * request time — the failure is a thrown error, not a quietly missing image,
     * so it would take the whole page down rather than degrade.
     *
     * Verified: every photo URL used on the page returns 200 image/jpeg.
     */
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
    ],
  },
};

export default nextConfig;

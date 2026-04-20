// ========================================
// Humanofi — Web App Manifest
// ========================================

import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Humanofi — The Human Token Market',
    short_name: 'Humanofi',
    description: 'Invest in people. Buy personal tokens on Solana. The first market where humans are the asset.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1144ff',
    icons: [
      { src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
      { src: '/Logo_noire.png', sizes: '192x192', type: 'image/png' },
    ],
  };
}

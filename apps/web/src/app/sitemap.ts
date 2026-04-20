// ========================================
// Humanofi — Dynamic Sitemap
// ========================================
// Includes all static pages + all creator profiles from Supabase.
// Next.js auto-serves this at /sitemap.xml.

import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://humanofi.xyz';

  // ── Static pages ──
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/create`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/explore`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${baseUrl}/leaderboard`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/how-it-works`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/for-creators`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/for-investors`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
  ];

  // ── Dynamic pages: all creator profiles ──
  let creatorPages: MetadataRoute.Sitemap = [];

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: creators } = await supabase
        .from('creator_tokens')
        .select('mint_address, updated_at')
        .order('updated_at', { ascending: false });

      creatorPages = (creators || []).map((c) => ({
        url: `${baseUrl}/person/${c.mint_address}`,
        lastModified: new Date(c.updated_at),
        changeFrequency: 'daily' as const,
        priority: 0.6,
      }));
    }
  } catch (err) {
    console.warn('[Sitemap] Failed to fetch creators:', err);
  }

  return [...staticPages, ...creatorPages];
}

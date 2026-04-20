// ========================================
// /person/[id] — Server Layout with SEO metadata
// ========================================
// This is the server-side layout that provides generateMetadata()
// for dynamic SEO (title, description, OG per creator).
// The actual client layout (context, data fetching) is in PersonLayout.tsx.

import { Metadata } from "next";
import PersonLayout from "./PersonLayout";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://humanofi.xyz";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    // Fetch creator data server-side for SEO
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: creator } = await supabase
        .from("creator_tokens")
        .select(
          "display_name, token_symbol, category, bio, avatar_url, holder_count"
        )
        .eq("mint_address", id)
        .single();

      if (creator) {
        const symbol = creator.token_symbol || "TOKEN";
        const title = `${creator.display_name} ($${symbol}) — ${creator.category || "Creator"} Token on Humanofi`;
        const description = `Invest in ${creator.display_name}. ${(creator.bio || "").slice(0, 140)}${(creator.bio || "").length > 140 ? "…" : ""} — ${creator.holder_count || 0} holders. Buy on Humanofi.`;

        return {
          title,
          description,
          alternates: { canonical: `/person/${id}` },
          openGraph: {
            title,
            description,
            type: "profile",
            url: `${BASE_URL}/person/${id}`,
            siteName: "Humanofi",
            images: creator.avatar_url
              ? [
                  {
                    url: creator.avatar_url,
                    width: 400,
                    height: 400,
                    alt: `${creator.display_name} on Humanofi`,
                  },
                ]
              : ["/og-default.png"],
          },
          twitter: {
            card: "summary",
            title: `${creator.display_name} ($${symbol}) on Humanofi`,
            description,
            images: creator.avatar_url
              ? [creator.avatar_url]
              : ["/og-default.png"],
          },
        };
      }
    }
  } catch (err) {
    console.warn("[SEO] Failed to generate metadata for person:", err);
  }

  // Fallback for unknown/mock creators
  return {
    title: "Creator Profile",
    description:
      "View this creator's profile and token on Humanofi — The Human Token Market.",
    alternates: { canonical: `/person/${id}` },
  };
}

export default async function PersonServerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let jsonLd = null;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: creator } = await supabase
        .from("creator_tokens")
        .select("display_name, token_symbol, category, bio, avatar_url, holder_count")
        .eq("mint_address", id)
        .single();

      if (creator) {
        // Build JSON-LD specifically for Humanofi Creator Tokens
        jsonLd = {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Person",
              "@id": `${BASE_URL}/person/${id}#person`,
              name: creator.display_name,
              description: creator.bio,
              image: creator.avatar_url || `${BASE_URL}/default-avatar.png`,
              jobTitle: creator.category,
            },
            {
              "@type": "Product",
              "@id": `${BASE_URL}/person/${id}#token`,
              name: `$${creator.token_symbol} — ${creator.display_name}'s Personal Token`,
              description: `Invest in ${creator.display_name} by buying their personal token. Hold to unlock their Inner Circle.`,
              image: creator.avatar_url || `${BASE_URL}/default-avatar.png`,
              brand: {
                "@type": "Brand",
                name: "Humanofi",
              },
              offers: {
                "@type": "Offer",
                priceCurrency: "SOL",
                availability: "https://schema.org/InStock",
                seller: {
                  "@type": "Organization",
                  name: "Humanofi Market",
                },
              },
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: "5.0",
                ratingCount: Math.max(Number(creator.holder_count) || 1, 1),
              },
            },
          ],
        };
      }
    }
  } catch (err) {
    // Ignore errors for SEO layout
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <PersonLayout params={params}>{children}</PersonLayout>
    </>
  );
}

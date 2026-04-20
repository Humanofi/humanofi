// SEO metadata for /explore page
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore Human Tokens — Discover & Invest in Verified Creators",
  description:
    "Browse verified creators, entrepreneurs, and artists on Humanofi. Compare prices, activity scores, and holder counts. Find the humans worth investing in on Solana.",
  alternates: { canonical: "/explore" },
  openGraph: {
    title: "Explore Human Tokens | Humanofi",
    description: "Discover and invest in verified human tokens on Solana.",
    images: ["/og-default.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Explore Human Tokens | Humanofi",
    description: "Browse verified creators. Compare prices, scores, holders. Invest on Solana.",
  },
};

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

// SEO metadata for /leaderboard page
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard — Top Human Tokens by Activity & Growth",
  description:
    "See who's trending on Humanofi. Human tokens ranked by activity score, holder growth, and trading volume. Updated in real-time on Solana.",
  alternates: { canonical: "/leaderboard" },
  openGraph: {
    title: "Human Token Leaderboard | Humanofi",
    description: "Top human tokens ranked by activity and growth.",
    images: ["/og-default.png"],
  },
};

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

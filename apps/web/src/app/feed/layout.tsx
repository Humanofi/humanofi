// SEO metadata for /feed page — noindex (personal/dynamic content)
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Feed — Latest Activity & Market Signals",
  description:
    "Real-time feed of trades, whale alerts, milestones, and creator posts on Humanofi. The pulse of the human token market.",
  alternates: { canonical: "/feed" },
  robots: { index: false, follow: true },
};

export default function FeedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

// SEO metadata for /create page
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Your Personal Token on Solana — No Code Required",
  description:
    "Tokenize yourself in minutes. Launch your personal token on Solana with Humanofi. Get discovered, build your community, earn from your reputation. Identity verified. Fair launch protected. $29.99 all-in.",
  alternates: { canonical: "/create" },
  openGraph: {
    title: "Create Your Token | Humanofi",
    description:
      "Launch your personal token on Solana in 5 minutes. No code. Identity verified. Fair launch protected.",
    images: ["/og-default.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Create Your Personal Token | Humanofi",
    description: "Tokenize yourself on Solana. No code required. $29.99 all-in.",
  },
};

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

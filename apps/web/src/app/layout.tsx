import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://humanofi.xyz";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1144ff",
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default: "Humanofi — Invest in People, Not Projects | The Human Token Market",
    template: "%s | Humanofi",
  },
  description:
    "Buy tokens representing real humans on Solana. Back the people you believe in, access their inner circle, and grow with them. The first market where humans are the asset.",

  keywords: [
    "personal token", "social token", "create my token", "tokenize yourself",
    "invest in people", "human token", "solana token", "creator economy",
    "personal token platform", "social token platform", "create token no code",
    "launch my own token", "creator token", "buy personal tokens",
  ],

  authors: [{ name: "Humanofi" }],
  creator: "Humanofi",
  publisher: "Humanofi",

  // Canonical
  alternates: { canonical: "/" },

  // Open Graph (global fallback)
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: "Humanofi",
    title: "Humanofi — Invest in People, Not Projects",
    description: "The first market where humans are the asset. Buy personal tokens on Solana.",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "Humanofi — The Human Token Market on Solana",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    site: "@humanofi",
    creator: "@humanofi",
    title: "Humanofi — Invest in People, Not Projects",
    description: "The first market where humans are the asset. Buy personal tokens on Solana.",
    images: ["/og-default.png"],
  },

  // Robots
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // Icons
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/Logo_noire.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        {/* JSON-LD Structured Data — Organization + WebSite + WebApplication */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": `${BASE_URL}/#organization`,
                  name: "Humanofi",
                  url: BASE_URL,
                  logo: {
                    "@type": "ImageObject",
                    url: `${BASE_URL}/Logo_noire.png`,
                  },
                  sameAs: ["https://twitter.com/humanofi"],
                  description: "The first market where humans are the asset. Buy personal tokens on Solana.",
                },
                {
                  "@type": "WebSite",
                  "@id": `${BASE_URL}/#website`,
                  url: BASE_URL,
                  name: "Humanofi",
                  publisher: { "@id": `${BASE_URL}/#organization` },
                  potentialAction: {
                    "@type": "SearchAction",
                    target: {
                      "@type": "EntryPoint",
                      urlTemplate: `${BASE_URL}/explore?search={search_term}`,
                    },
                    "query-input": "required name=search_term",
                  },
                },
                {
                  "@type": "WebApplication",
                  name: "Humanofi",
                  url: BASE_URL,
                  applicationCategory: "FinanceApplication",
                  operatingSystem: "Web",
                  offers: {
                    "@type": "Offer",
                    price: "0",
                    priceCurrency: "USD",
                    description: "Free to browse and invest. $29.99 to create your token.",
                  },
                },
              ],
            }),
          }}
        />
        <Providers>
          <div className="app">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}

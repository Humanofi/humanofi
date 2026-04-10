import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Humanofi — The first market where humans are the asset | Beta Devnet",
  description:
    "Back the people you believe in. Buy their token, access their private inner circle, and grow with them. Built on Solana.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        <Providers>
          <div className="app">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}

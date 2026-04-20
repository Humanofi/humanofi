// ========================================
// Humanofi — For Investors (SEO Landing Page)
// ========================================
// Server-rendered. Conversion-focused.
// Targets: "invest in people crypto", "buy personal tokens",
//          "social token investment", "human capital crypto"

import type { Metadata } from "next";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "For Investors — Invest in People, Not Projects | Human Token Market",
  description:
    "Stop chasing meme coins. Invest in real, identity-verified humans on Solana. Buy personal tokens, access Inner Circles, and grow with the people you believe in. Always liquid via bonding curve.",
  alternates: { canonical: "/for-investors" },
  openGraph: {
    title: "Invest in People | Humanofi",
    description:
      "The first market where humans are the asset. Buy personal tokens on Solana.",
    images: ["/og-default.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Invest in People | Humanofi",
    description:
      "Stop chasing meme coins. Back real humans. Buy personal tokens on Solana.",
  },
};

export default function ForInvestorsPage() {
  return (
    <>
      {/* JSON-LD: BreadcrumbList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Humanofi", item: "https://humanofi.xyz" },
              { "@type": "ListItem", position: 2, name: "For Investors", item: "https://humanofi.xyz/for-investors" },
            ],
          }),
        }}
      />

      <div className="halftone-bg" />
      <Topbar />

      <main className="page" style={{ maxWidth: 1100, margin: "0 auto", minHeight: "100vh" }}>

        {/* Hero */}
        <header className="seo-page__hero" style={{ borderBottom: "none", paddingTop: 40 }}>
          <div className="seo-page__badge">📊 FOR INVESTORS</div>
          <h1 className="page__title" style={{ fontSize: "clamp(2rem, 4.5vw, 3.2rem)", margin: "0 auto 20px" }}>
            Stop Chasing Meme Coins.<br />Invest in Real Humans.
          </h1>
          <p className="page__subtitle" style={{ maxWidth: 680, margin: "0 auto 36px" }}>
            On Humanofi, every token represents a real, identity-verified human. No anonymous devs.
            No pump &amp; dump. Just real people building real value — and you can invest in them.
          </p>
          <div className="seo-page__hero-ctas">
            <Link href="/explore" className="btn-solid">Explore Humans →</Link>
            <Link href="/how-it-works" className="btn-outline">How It Works</Link>
          </div>
        </header>

        {/* Why */}
        <section className="seo-page__section">
          <h2>Why Invest in People?</h2>
          <div className="seo-page__grid seo-page__grid--3">
            <div className="seo-page__card card-base">
              <div className="seo-page__card-icon">✅</div>
              <h3>Identity Verified</h3>
              <p>Every creator passes biometric KYC. You know exactly who you&apos;re investing in. No anonymous rugs.</p>
            </div>
            <div className="seo-page__card card-base">
              <div className="seo-page__card-icon">📈</div>
              <h3>Backed by Real Activity</h3>
              <p>Tokens are valued by the creator&apos;s real-world activity, engagement, and community growth — not hype.</p>
            </div>
            <div className="seo-page__card card-base">
              <div className="seo-page__card-icon">🔓</div>
              <h3>Inner Circle Access</h3>
              <p>As a holder, you unlock the creator&apos;s private Inner Circle — exclusive content, polls, events, and direct access.</p>
            </div>
            <div className="seo-page__card card-base">
              <div className="seo-page__card-icon">💧</div>
              <h3>Always Liquid</h3>
              <p>The bonding curve guarantees you can always sell — 24/7. No waiting for buyers. No illiquid positions.</p>
            </div>
            <div className="seo-page__card card-base">
              <div className="seo-page__card-icon">🛡</div>
              <h3>Fair Launch Protected</h3>
              <p>24-hour anti-snipe window prevents whale manipulation. Every early holder gets a fair entry price.</p>
            </div>
            <div className="seo-page__card card-base">
              <div className="seo-page__card-icon">🔒</div>
              <h3>Anti-Rug Mechanisms</h3>
              <p>Creator tokens locked 1 year. Smart sell limiter. On-chain transparency. Built to protect you.</p>
            </div>
          </div>
        </section>

        {/* How to invest */}
        <section className="seo-page__section">
          <h2>How to Invest on Humanofi</h2>
          <div className="seo-page__steps">
            <div className="seo-page__step card-base">
              <div className="seo-page__step-num">01</div>
              <div>
                <h3>Explore the Market</h3>
                <p>Browse verified creators on the <Link href="/explore" style={{ color: "var(--accent)", fontWeight: 700 }}>Explore page</Link>. Filter by category, activity score, holder count, and price. Read their bios, check their socials, study their charts.</p>
              </div>
            </div>
            <div className="seo-page__step card-base">
              <div className="seo-page__step-num">02</div>
              <div>
                <h3>Do Your Research</h3>
                <p>Each creator has an Activity Score (0-100) based on their posting frequency, holder engagement, and community growth. Higher scores = more active creators. Check the trading history and holder distribution.</p>
              </div>
            </div>
            <div className="seo-page__step card-base">
              <div className="seo-page__step-num">03</div>
              <div>
                <h3>Buy with SOL</h3>
                <p>Connect your wallet (Phantom, email, or social login). Enter the amount and buy. The bonding curve instantly calculates the price. Transactions confirm in under 1 second on Solana.</p>
              </div>
            </div>
            <div className="seo-page__step card-base">
              <div className="seo-page__step-num">04</div>
              <div>
                <h3>Hold &amp; Engage</h3>
                <p>As a holder, you unlock the creator&apos;s Inner Circle. Engage with their content, participate in polls, attend events. The more you participate, the more value you get from your investment.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section className="seo-page__section">
          <h2>Humanofi vs. Traditional Crypto Investments</h2>
          <div className="seo-page__table-wrap">
            <table className="seo-page__table card-base" style={{ overflow: "hidden", padding: 0 }}>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Meme Coins</th>
                  <th>NFTs</th>
                  <th>Humanofi</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Creator Identity</td><td>❌ Anonymous</td><td>⚠️ Sometimes</td><td>✅ KYC Verified</td></tr>
                <tr><td>Liquidity</td><td>⚠️ Depends on DEX</td><td>❌ Often illiquid</td><td>✅ Always liquid (bonding curve)</td></tr>
                <tr><td>Rug Pull Protection</td><td>❌ None</td><td>❌ None</td><td>✅ Token lock + sell limiter</td></tr>
                <tr><td>Fair Launch</td><td>❌ Whales snipe</td><td>⚠️ Allowlists</td><td>✅ 24h anti-snipe window</td></tr>
                <tr><td>Ongoing Value</td><td>❌ None</td><td>❌ Static art</td><td>✅ Inner Circle access</td></tr>
                <tr><td>Transparent Fees</td><td>❌ Hidden</td><td>⚠️ Varies</td><td>✅ 5% Asymmetric (Favors buying)</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Risk */}
        <section className="seo-page__section">
          <h2>Understanding the Risks</h2>
          <p>
            Humanofi is transparent about risks. Personal tokens are speculative assets. A creator&apos;s
            token price can go down if activity decreases, holders sell, or the creator becomes inactive.
            However, Humanofi&apos;s structural protections (KYC, token lock, sell limiter, activity scoring)
            significantly reduce the risks compared to traditional crypto investments.
          </p>
          <p>
            <strong>Never invest more than you can afford to lose.</strong> Do your own research. Study
            the creator&apos;s history, activity score, and community before buying.
          </p>
        </section>

        {/* CTA */}
        <section className="seo-page__section seo-page__final-cta card-base" style={{ marginTop: 64, padding: "64px 24px" }}>
          <h2>Ready to Invest in People?</h2>
          <p>
            Browse verified creators. Study their activity. Buy their tokens. Join their Inner Circles.
            Welcome to the human token market.
          </p>
          <div className="seo-page__hero-ctas">
            <Link href="/explore" className="btn-solid">Explore the Market →</Link>
            <Link href="/create" className="btn-outline">Or Create Your Own Token</Link>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}

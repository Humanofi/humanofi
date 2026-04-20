// ========================================
// Humanofi — For Creators (SEO Landing Page)
// ========================================
// Server-rendered. Conversion-focused.
// Targets: "tokenize yourself", "creator token", "monetize audience crypto",
//          "launch my own token", "create personal token"

import type { Metadata } from "next";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "For Creators — Tokenize Yourself & Earn From Your Reputation",
  description:
    "Launch your personal token on Solana with Humanofi. Earn up to 3% on every trade, build a token-gated Inner Circle, and let your supporters invest in your success. No code. $29.99 all-in.",
  alternates: { canonical: "/for-creators" },
  openGraph: {
    title: "For Creators | Humanofi — Tokenize Yourself",
    description:
      "Your reputation has value. Now you can own it. Launch your personal token on Solana.",
    images: ["/og-default.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tokenize Yourself | Humanofi",
    description:
      "Launch your personal token. Earn from your reputation. Build your Inner Circle.",
  },
};

export default function ForCreatorsPage() {
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
              { "@type": "ListItem", position: 2, name: "For Creators", item: "https://humanofi.xyz/for-creators" },
            ],
          }),
        }}
      />

      <div className="halftone-bg" />
      <Topbar />

      <main className="page" style={{ maxWidth: 1100, margin: "0 auto", minHeight: "100vh" }}>

        {/* Hero */}
        <header className="seo-page__hero" style={{ borderBottom: "none", paddingTop: 40 }}>
          <div className="seo-page__badge">🚀 FOR CREATORS</div>
          <h1 className="page__title" style={{ fontSize: "clamp(2rem, 4.5vw, 3.2rem)", margin: "0 auto 20px" }}>
            Your Reputation Has Value.<br />Now You Can Own It.
          </h1>
          <p className="page__subtitle" style={{ maxWidth: 680, margin: "0 auto 36px" }}>
            You build an audience. You create content. You ship products. But platforms keep the value.
            With Humanofi, you launch your own personal token on Solana — and your supporters invest directly in you.
          </p>
          <div className="seo-page__hero-ctas">
            <Link href="/create" className="btn-solid">Create Your Token — $29.99 →</Link>
            <Link href="/how-it-works" className="btn-outline">How It Works</Link>
          </div>
        </header>

        {/* Pain → Solution */}
        <section className="seo-page__section">
          <h2>The Problem With Today&apos;s Creator Economy</h2>
          <div className="seo-page__grid seo-page__grid--3">
            <div className="seo-page__card card-base">
              <div className="seo-page__card-icon">📉</div>
              <h3>Platforms Own Your Value</h3>
              <p>You create the content. YouTube, TikTok, and Instagram keep the profits. Algorithm changes wipe out your reach overnight.</p>
            </div>
            <div className="seo-page__card card-base">
              <div className="seo-page__card-icon">🔇</div>
              <h3>Followers Can&apos;t Invest In You</h3>
              <p>Your biggest fans want to support you, but they can only like, subscribe, or donate. They can&apos;t invest in your success and grow with you.</p>
            </div>
            <div className="seo-page__card card-base">
              <div className="seo-page__card-icon">💸</div>
              <h3>Trust Is Hard to Monetize</h3>
              <p>You&apos;ve built credibility over years. But there&apos;s no financial instrument that captures and rewards that trust. Until now.</p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="seo-page__section">
          <h2>How Humanofi Works for Creators</h2>
          <div className="seo-page__steps">
            <div className="seo-page__step card-base">
              <div className="seo-page__step-num">01</div>
              <div>
                <h3>Create Your Token (5 minutes)</h3>
                <p>Connect your wallet, verify your identity, build your profile, and launch. No code. No smart contract knowledge. Your token is live on Solana in minutes.</p>
              </div>
            </div>
            <div className="seo-page__step card-base">
              <div className="seo-page__step-num">02</div>
              <div>
                <h3>Share &amp; Build Your Community</h3>
                <p>Share your token page on Twitter, Instagram, YouTube, and Discord. Every supporter who buys your token is making a public vote of confidence — visible on-chain forever.</p>
              </div>
            </div>
            <div className="seo-page__step card-base">
              <div className="seo-page__step-num">03</div>
              <div>
                <h3>Earn Passive Income</h3>
                <p>You earn <strong>3% when someone buys your token, and 1% when they sell</strong>. This asymmetric split rewards your early believers. Fees accrue in an on-chain smart vault and are claimable every 15 days.</p>
              </div>
            </div>
            <div className="seo-page__step card-base">
              <div className="seo-page__step-num">04</div>
              <div>
                <h3>Run Your Inner Circle</h3>
                <p>Post exclusive content, polls, events, and behind-the-scenes updates for your token holders. Your Inner Circle is a token-gated VIP community — only believers get in.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Revenue Model */}
        <section className="seo-page__section">
          <h2>Your Revenue as a Creator</h2>
          <div className="seo-page__grid seo-page__grid--2">
            <div className="seo-page__card seo-page__card--highlight card-base">
              <h3>💰 Asymmetric Trading Fees</h3>
              <p>Every time someone buys your token, you earn 3%. If they sell, you earn 1%. Your rewards accumulate in a secure on-chain Creator Vault, claimable every 15 days.</p>
            </div>
            <div className="seo-page__card seo-page__card--highlight card-base">
              <h3>📈 Token Appreciation</h3>
              <p>As more people believe in you, your token price rises via the bonding curve. Your locked allocation (51K tokens) grows in value alongside your community.</p>
            </div>
          </div>
          <p style={{ textAlign: "center", marginTop: 24, fontWeight: 700, opacity: 0.7 }}>
            Example: If your token generates 100 SOL in monthly trading volume, you earn 2 SOL/month (~$300) passively.
          </p>
        </section>

        {/* Protection */}
        <section className="seo-page__section">
          <h2>Built to Protect You &amp; Your Community</h2>
          <div className="seo-page__grid seo-page__grid--2">
            <div className="seo-page__card card-base">
              <h3>🛡 Fair Launch (24h)</h3>
              <p>No whale can buy more than 5% of your supply in the first 24 hours. Your early supporters get a fair shot.</p>
            </div>
            <div className="seo-page__card card-base">
              <h3>🔒 Creator Lock (1 Year)</h3>
              <p>Your creator tokens are locked for 1 year. This proves your long-term commitment to your community.</p>
            </div>
            <div className="seo-page__card card-base">
              <h3>📉 Smart Sell Limiter</h3>
              <p>Even creators are restricted: you can only sell up to 5% impact every 30 days. No flash crashes, no rugs.</p>
            </div>
            <div className="seo-page__card card-base">
              <h3>🌐 Full Transparency</h3>
              <p>Every trade, every holder, every price movement — all public on Solana. Your community can always verify the facts.</p>
            </div>
          </div>
        </section>

        {/* Who */}
        <section className="seo-page__section">
          <h2>Who Creates Tokens on Humanofi?</h2>
          <p>
            Humanofi is for anyone with a reputation worth tokenizing. Founders, developers, artists,
            musicians, athletes, influencers, educators, coaches, journalists, scientists, and more.
            If people believe in you, you belong on Humanofi.
          </p>
          <div className="seo-page__grid seo-page__grid--3">
            {[
              { emoji: "🚀", title: "Founders", desc: "Tokenize your startup journey. Let early believers invest in you before your Series A." },
              { emoji: "🎨", title: "Artists & Musicians", desc: "Turn your fanbase into an on-chain community. Reward your most loyal supporters." },
              { emoji: "💻", title: "Developers", desc: "Open-source contributors, indie hackers, and builders. Let the community fund your work." },
              { emoji: "🎬", title: "Content Creators", desc: "YouTubers, TikTokers, podcasters. Your audience becomes your investors." },
              { emoji: "🏋️", title: "Athletes & Coaches", desc: "Your training, your results, your brand. Let fans invest in your career." },
              { emoji: "📚", title: "Educators & Researchers", desc: "Monetize your expertise. Build a knowledge community with skin in the game." },
            ].map((item) => (
              <div key={item.title} className="seo-page__card card-base">
                <div className="seo-page__card-icon">{item.emoji}</div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="seo-page__section seo-page__final-cta card-base" style={{ marginTop: 64, padding: "64px 24px" }}>
          <h2>Ready to Tokenize Yourself?</h2>
          <p>
            Launch your personal token in 5 minutes. No code. No monthly fees. Start earning from your reputation today.
          </p>
          <div className="seo-page__hero-ctas">
            <Link href="/create" className="btn-solid">Create Your Token — $29.99 →</Link>
            <Link href="/how-it-works" className="btn-outline">Learn More</Link>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}

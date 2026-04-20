// ========================================
// Humanofi — How It Works (SEO Landing Page)
// ========================================
// Server-rendered. Rich text content for Google indexing.
// Targets: "how to create a token", "personal token platform",
//          "social token", "tokenize yourself"

import type { Metadata } from "next";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "How Humanofi Works — Create & Trade Personal Tokens on Solana",
  description:
    "Learn how to create your personal token on Solana in 5 minutes. Understand bonding curves, fair launch protection, inner circles, and the human token economy. No code required.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "How Humanofi Works | The Human Token Market",
    description:
      "Create your personal token in 5 minutes. Fair launch protection. Inner circles. Built on Solana.",
    images: ["/og-default.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "How Humanofi Works — Personal Tokens on Solana",
    description:
      "Create, trade, and invest in personal tokens. No code. Identity verified. Fair launch.",
  },
};

// ── FAQ Data (also used for JSON-LD) ──
const FAQ_ITEMS = [
  {
    question: "What is Humanofi?",
    answer:
      "Humanofi is the first decentralized platform where real humans can create personal tokens on Solana. Each token represents a verified individual — their reputation, their community, and their potential. Supporters can buy tokens to invest in someone they believe in and access their private Inner Circle.",
  },
  {
    question: "How much does it cost to create a token?",
    answer:
      "Token creation costs a flat $29.99. This includes identity verification, on-chain deployment, token seed liquidity, and your Humanofi profile. No hidden fees, no monthly costs. You start earning from day one through trading fees on your token.",
  },
  {
    question: "What blockchain does Humanofi use?",
    answer:
      "Humanofi is built on Solana — the fastest blockchain with transaction fees under $0.01. Your token uses the Token-2022 standard for maximum security and interoperability. All transactions are confirmed in under 1 second.",
  },
  {
    question: "Can I sell my tokens anytime?",
    answer:
      "Yes. The bonding curve ensures permanent liquidity — you can sell your tokens at any time, 24/7. There is no lockup period for holders. Creator tokens are locked for 1 year to prevent rug pulls.",
  },
  {
    question: "How is the token price determined?",
    answer:
      "Prices follow an automated bonding curve — a mathematical formula where the price increases as more tokens are bought and decreases as tokens are sold. There is no order book and no market maker. The curve guarantees you can always buy or sell at a fair, transparent price.",
  },
  {
    question: "What is Fair Launch Protection?",
    answer:
      "During the first 24 hours after a token is created, each wallet is limited to 50,000 tokens (5% of supply). This prevents whales from buying a massive position early and dumping on smaller holders. After 24 hours, the market is fully open.",
  },
  {
    question: "Is my identity safe?",
    answer:
      "Identity verification is handled by Didit, a privacy-first KYC provider. Humanofi never stores your ID documents. We only receive a verified/not-verified confirmation. Your real name, nationality, and photo are yours to share on your profile — or not.",
  },
  {
    question: "What is an Inner Circle?",
    answer:
      "An Inner Circle is a private community for token holders. When you hold someone's token, you unlock their Inner Circle — exclusive posts, polls, events, and direct updates from the creator. Think of it as a token-gated VIP membership.",
  },
  {
    question: "What are the fees?",
    answer:
      "Every trade has a 5% fee, but it is split asymmetrically to reward belief over doubt. When someone BUYS your token: you earn 3%, 1% goes to the protocol, and 1% is locked forever as 'k-deepening' liquidity. When someone SELLS: the protocol takes 3%, you earn 1%, and 1% is locked as liquidity. There are no additional hidden costs.",
  },
  {
    question: "Can someone create a fake token with my name?",
    answer:
      "No. Every token creator must pass biometric identity verification (face scan + ID document). Humanofi enforces one token per verified human. Duplicate or impersonation attempts are automatically blocked.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      {/* JSON-LD: FAQPage */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ_ITEMS.map((item) => ({
              "@type": "Question",
              name: item.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: item.answer,
              },
            })),
          }),
        }}
      />

      {/* JSON-LD: BreadcrumbList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Humanofi",
                item: "https://humanofi.xyz",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "How It Works",
                item: "https://humanofi.xyz/how-it-works",
              },
            ],
          }),
        }}
      />

      <div className="halftone-bg" />
      <Topbar />

      <main className="page" style={{ maxWidth: 1100, margin: "0 auto", minHeight: "100vh" }}>
        {/* ── Hero ── */}
        <header className="seo-page__hero" style={{ borderBottom: "none", paddingTop: 40 }}>
          <div className="seo-page__badge">📖 COMPLETE GUIDE</div>
          <h1 className="page__title" style={{ fontSize: "clamp(2rem, 4.5vw, 3.2rem)", margin: "0 auto 20px" }}>
            How Humanofi Works: Create &amp; Trade Personal Tokens on Solana
          </h1>
          <p className="page__subtitle" style={{ maxWidth: 680, margin: "0 auto 36px" }}>
            Humanofi is the first platform where you can create a personal token
            representing yourself, build a community of believers, and earn from
            your reputation. Built on Solana for instant, low-cost transactions.
          </p>
          <div className="seo-page__hero-ctas">
            <Link href="/create" className="btn-solid">
              Create Your Token →
            </Link>
            <Link href="/explore" className="btn-outline">
              Explore Humans
            </Link>
          </div>
        </header>

        {/* ── Section 1: What is it? ── */}
        <section className="seo-page__section">
          <h2>What Is a Personal Token?</h2>
          <p>
            A personal token is a cryptocurrency that represents a real,
            identity-verified human being. Unlike meme coins (which represent
            nothing), utility tokens (which represent software access), or NFTs
            (which represent digital art), a personal token represents{" "}
            <strong>you</strong> — your reputation, your potential, and your
            community.
          </p>
          <p>
            When someone buys your token, they&apos;re making a public statement:
            &ldquo;I believe in this person.&rdquo; It&apos;s a verifiable, on-chain
            vote of confidence that anyone can see. The more people believe in
            you, the more valuable your token becomes.
          </p>
          <div className="seo-page__grid">
            <div className="seo-page__card card-base">
              <div className="seo-page__card-icon">🪙</div>
              <h3>Meme Coins</h3>
              <p>No real value. Pump &amp; dump. Anonymous creators. Zero utility.</p>
              <div className="seo-page__card-verdict">❌ Gambling</div>
            </div>
            <div className="seo-page__card card-base">
              <div className="seo-page__card-icon">🎨</div>
              <h3>NFTs</h3>
              <p>One-time art purchase. No ongoing relationship. Illiquid.</p>
              <div className="seo-page__card-verdict">⚠️ Speculative</div>
            </div>
            <div className="seo-page__card seo-page__card--highlight card-base">
              <div className="seo-page__card-icon">👤</div>
              <h3>Personal Tokens</h3>
              <p>
                Verified identity. Ongoing relationship. Always liquid. Fair
                launch protected.
              </p>
              <div className="seo-page__card-verdict">✅ The future</div>
            </div>
          </div>
        </section>

        {/* ── Section 2: How to Create ── */}
        <section className="seo-page__section">
          <h2>How to Create Your Personal Token</h2>
          <p>
            Creating your token on Humanofi takes less than 5 minutes. No
            coding, no smart contract knowledge, no blockchain experience
            required. Here&apos;s how:
          </p>
          <div className="seo-page__steps">
            <div className="seo-page__step card-base">
              <div className="seo-page__step-num">01</div>
              <div>
                <h3>Connect Your Wallet</h3>
                <p>
                  Use Phantom, an email login, or a social account via Privy.
                  Humanofi creates a secure wallet for you if you don&apos;t have
                  one. No seed phrase needed.
                </p>
              </div>
            </div>
            <div className="seo-page__step card-base">
              <div className="seo-page__step-num">02</div>
              <div>
                <h3>Verify Your Identity</h3>
                <p>
                  Complete a quick biometric scan (face + ID document) via Didit.
                  This is free, instant, and privacy-first. It ensures one token
                  per person — no fakes, no bots, no impersonation.
                </p>
              </div>
            </div>
            <div className="seo-page__step card-base">
              <div className="seo-page__step-num">03</div>
              <div>
                <h3>Build Your Profile</h3>
                <p>
                  Upload your photo, write your bio, tell your story, and link
                  your socials. This is what investors see. Be authentic — your
                  profile is your pitch to the world.
                </p>
              </div>
            </div>
            <div className="seo-page__step card-base">
              <div className="seo-page__step-num">04</div>
              <div>
                <h3>Launch — $29.99 All-In</h3>
                <p>
                  Pay a one-time fee of $29.99 (which covers the 0.03 SOL minimum liquidity + infrastructure). Your token is deployed
                  instantly with 1,000,000 supply, a bonding curve for automated
                  pricing, and 24-hour Fair Launch Protection to prevent whale
                  manipulation.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 3: Market Mechanics ── */}
        <section className="seo-page__section">
          <h2>How the Market Works</h2>

          <h3>Bonding Curve Pricing</h3>
          <p>
            Every token on Humanofi uses an automated bonding curve — a smart
            contract that sets the price algorithmically based on supply and
            demand. When someone buys, the price goes up. When someone sells,
            the price goes down. No order books, no market makers, no
            manipulation.
          </p>

          <h3>Anti-Snipe Fair Launch (24h Protection)</h3>
          <p>
            During the first 24 hours after token creation, each wallet is
            limited to 50,000 tokens (5% of total supply). This prevents whales
            from buying a massive position early and dumping on genuine
            supporters. After 24 hours, the market is fully open with no
            restrictions.
          </p>

          <h3>Transparent &amp; Asymmetric Fees</h3>
          <p>
            Every trade has a 5% fee, split to reward belief over doubt. 
            <strong>On Buys:</strong> 3% to the creator vault, 1% to the protocol, and 1% to &quot;k-deepening&quot; (permanently locked liquidity to stabilize the token). 
            <strong>On Sells:</strong> 1% to the creator, 3% to the protocol, and 1% to liquidity.
            This ensures creators earn passive income, while the curve gets stronger and safer over time.
          </p>
        </section>

        {/* ── Section 4: Security ── */}
        <section className="seo-page__section">
          <h2>Security &amp; Trust</h2>
          <div className="seo-page__grid seo-page__grid--2">
            <div className="seo-page__card card-base">
              <h3>🛡 Identity Verified</h3>
              <p>
                Every creator passes biometric KYC. No anonymous tokens. No
                impersonation.
              </p>
            </div>
            <div className="seo-page__card card-base">
              <h3>🔒 Creator Tokens Locked</h3>
              <p>
                Creator-allocated tokens are locked for 1 year. Creators cannot
                dump their own supply.
              </p>
            </div>
            <div className="seo-page__card card-base">
              <h3>📉 Smart Sell Limiter</h3>
              <p>
                Large creator sells are limited to prevent flash crashes and
                protect holder value.
              </p>
            </div>
            <div className="seo-page__card card-base">
              <h3>🌐 On-Chain Transparency</h3>
              <p>
                Every transaction is recorded on Solana. Anyone can verify any
                trade, any time.
              </p>
            </div>
          </div>
        </section>

        {/* ── Section 5: Inner Circles ── */}
        <section className="seo-page__section">
          <h2>Inner Circles — Token-Gated Communities</h2>
          <p>
            When you hold someone&apos;s token, you unlock their Inner Circle — a
            private space where the creator shares exclusive content, polls,
            behind-the-scenes updates, and even events. The more tokens you
            hold, the stronger your connection. Think of it as a VIP membership
            powered by your investment.
          </p>
          <p>
            Creators can post text, images, polls, and event invitations.
            Holders can react, comment, and engage directly. It&apos;s a new social
            layer built on financial alignment — everyone in the circle has skin
            in the game.
          </p>
        </section>

        {/* ── FAQ ── */}
        <section className="seo-page__section seo-page__faq">
          <h2>Frequently Asked Questions</h2>
          <div className="seo-page__faq-list">
            {FAQ_ITEMS.map((item, i) => (
              <details key={i} className="seo-page__faq-item card-base" style={{ padding: 0, marginBottom: -2 }}>
                <summary style={{ padding: "18px 24px" }}>{item.question}</summary>
                <p style={{ padding: "0 24px 18px", margin: 0 }}>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="seo-page__section seo-page__final-cta card-base" style={{ marginTop: 64, padding: "64px 24px" }}>
          <h2>Ready to Get Started?</h2>
          <p>
            Whether you want to create your own token or invest in someone you
            believe in, Humanofi makes it simple, safe, and transparent.
          </p>
          <div className="seo-page__hero-ctas">
            <Link href="/create" className="btn-solid">
              Create Your Token — $29.99
            </Link>
            <Link href="/explore" className="btn-outline">
              Explore the Market
            </Link>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}

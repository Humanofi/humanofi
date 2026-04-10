"use client";

import { use, useState, useCallback } from "react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import { getPersonById } from "@/lib/mockData";
import BondingCurveChart from "@/components/BondingCurveChart";
import Link from "next/link";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { useHumanofi } from "@/hooks/useHumanofi";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";

const MOCK_POSTS = [
  {
    date: "Today · 14:00",
    text: "Just closed a position with a 34% ROI. Detailed analysis below. The market still isn't pricing in this sector correctly.",
  },
  {
    date: "Yesterday · 09:30",
    text: "If you look at the engagement metrics for Q3, we lost 12%. I restructured the team this morning. Hard decisions.",
  },
];

// Treasury wallet (protocol fee receiver)
const TREASURY = new PublicKey(
  process.env.NEXT_PUBLIC_TREASURY_WALLET || "11111111111111111111111111111111"
);

export default function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const person = getPersonById(id);
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");

  // Auth & protocol
  const { authenticated, login } = usePrivy();
  const { buyTokens, sellTokens, connected } = useHumanofi();

  const handleTrade = useCallback(async () => {
    if (!authenticated) {
      login();
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }

    if (!person) return;

    // In production, mint_address would come from Supabase
    // For now, use a placeholder — will be replaced when real tokens exist
    const mockMint = "11111111111111111111111111111111";

    try {
      if (activeTab === "buy") {
        await buyTokens({
          mint: new PublicKey(mockMint),
          solAmount: parsedAmount,
          creatorWallet: new PublicKey(mockMint), // Will be real creator wallet
          treasury: TREASURY,
        });
      } else {
        await sellTokens({
          mint: new PublicKey(mockMint),
          tokenAmount: parsedAmount * 1_000_000, // 6 decimals
          creatorWallet: new PublicKey(mockMint),
          treasury: TREASURY,
        });
      }
      setAmount("");
    } catch {
      // Error already handled by toast in useHumanofi
    }
  }, [authenticated, login, amount, person, activeTab, buyTokens, sellTokens]);

  if (!person) {
    return (
      <>
        <Topbar />
        <main className="page">
          <h1 className="page__title">Person not found</h1>
          <p style={{ marginTop: 12 }}>
            <Link href="/" className="btn-solid">Back to Explore</Link>
          </p>
        </main>
        <Footer />
      </>
    );
  }

  // Estimate what user will receive (simplified bonding curve preview)
  const parsedAmt = parseFloat(amount) || 0;
  const estimateReceive = activeTab === "buy"
    ? (parsedAmt / (person.priceNum || 1)).toFixed(2)
    : (parsedAmt * (person.priceNum || 0)).toFixed(4);

  return (
    <>
      <div className="halftone-bg" />
      <Topbar />

      <main className="page" style={{ paddingTop: 40, maxWidth: 1200 }}>
        <p style={{ marginBottom: 32 }}>
          <Link href="/" style={{ fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase" }}>
            ← Back to Marketplace
          </Link>
        </p>

        {/* PROFILE HEADER */}
        <div className="profile-header">
          <Image src={person.photoUrl} alt={person.name} width={160} height={160} className="profile-header__img" priority />
          <div className="profile-header__info">
            <h1 className="profile-header__name">{person.name}</h1>
            <div className="profile-header__meta">
              <span className="profile-header__tag">{person.tag}</span>
              <span className="profile-header__country">Country: {person.country}</span>
            </div>
            
            <div className="profile-header__socials">
              {Object.entries(person.socials || {}).map(([platform, handle]) => (
                <a key={platform} href="#" className="social-link" title={handle}>
                  {platform} ↗
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="profile-grid">
          {/* LEFT COLUMN: STORY & MAIN CONTENT */}
          <div className="profile-main">
            
            <section className="profile-section">
              <h2 className="profile-section__title">The Story</h2>
              <p className="profile-section__text">{person.story}</p>
            </section>

            <section className="profile-section">
              <h2 className="profile-section__title">What I Offer (Inner Circle)</h2>
              <p className="profile-section__text">{person.offer}</p>
            </section>

            <section className="profile-section">
              <BondingCurveChart
                currentPrice={person.priceNum}
                change={person.change}
                sparkline={person.sparkline}
                height={220}
              />
            </section>

            <section className="feed">
              <div className="feed__header">
                <h2 className="feed__title">Inner Circle Feed</h2>
                <div className="feed__count">2 POSTS</div>
              </div>

              {authenticated && connected ? (
                MOCK_POSTS.map((post, i) => (
                  <div key={i} className="feed__post">
                    <div className="feed__post-date">{post.date}</div>
                    <div className="feed__post-text">{post.text}</div>
                  </div>
                ))
              ) : (
                <div className="feed__locked">
                  <div className="feed__locked-icon">◈</div>
                  <div className="feed__locked-text">Inner Circle Locked</div>
                  <div className="feed__locked-sub">You must hold {person.name.split(" ")[0]}&apos;s tokens to view this content.</div>
                </div>
              )}
            </section>

          </div>

          {/* RIGHT COLUMN: METRICS & TRADING */}
          <div className="profile-sidebar">
            <div className="profile__stats-grid">
              <div className="stat-card">
                <div className="stat-card__lbl">Price</div>
                <div className="stat-card__val">{person.price}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card__lbl">Est. APY</div>
                <div className="stat-card__val" style={{ color: "var(--up)" }}>{person.apy}%</div>
              </div>
              <div className="stat-card">
                <div className="stat-card__lbl">Market Cap</div>
                <div className="stat-card__val">{person.marketCap}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card__lbl">Holders</div>
                <div className="stat-card__val">{person.holders.toLocaleString("en-US")}</div>
              </div>
            </div>

            <div className="trade-widget">
              <div className="trade-widget__info">
                <div style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase" }}>Activity Score</div>
                <div style={{ marginLeft: "auto", fontWeight: 800 }}>{person.activityScore}/100</div>
              </div>

              <div className="trade-widget__tabs">
                <button
                  className={`trade-tab ${activeTab === "buy" ? "active" : ""}`}
                  onClick={() => setActiveTab("buy")}
                >
                  Buy
                </button>
                <button
                  className={`trade-tab ${activeTab === "sell" ? "active" : ""}`}
                  onClick={() => setActiveTab("sell")}
                >
                  Sell
                </button>
              </div>

              <div style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", marginBottom: 8, color: "var(--text-muted)" }}>
                {activeTab === "buy" ? "Amount in SOL" : `Amount of ${person.name.split(" ")[0].toUpperCase()}`}
              </div>
              <input
                type="number"
                className="trade-input"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />

              <div style={{ marginBottom: 16, fontSize: "0.75rem", fontWeight: 800, color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
                <span>You will {activeTab === "buy" ? "receive" : "get"}</span>
                <span style={{ color: "var(--text)" }}>
                  ~{estimateReceive} {activeTab === "buy" ? "tokens" : "SOL"}
                </span>
              </div>

              <button 
                className="btn-solid" 
                style={{ width: "100%", background: activeTab === "buy" ? "var(--accent)" : "var(--down, #e53e3e)" }}
                onClick={handleTrade}
              >
                {!authenticated
                  ? "Connect Wallet"
                  : activeTab === "buy"
                  ? "Execute Buy"
                  : "Execute Sell"
                }
              </button>
            </div>
            
            <div style={{ marginTop: 24, fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
              <strong>Lock Info:</strong> {person.name.split(" ")[0]} can only unlock {20 * person.vestingYear}% of their supply. Their interests are aligned long-term.
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}

"use client";

import { useState, useCallback, useMemo } from "react";
import BondingCurveChart from "@/components/BondingCurveChart";
import { usePrivy } from "@privy-io/react-auth";
import { useHumanofi } from "@/hooks/useHumanofi";
import { useSolPrice } from "@/hooks/useSolPrice";
import { formatUsd, solToUsd } from "@/lib/price";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import { usePerson } from "./layout";
import LatestPublicPost from "@/components/public-feed/LatestPublicPost";
import { motion } from "framer-motion";
import {
  TrendUp, TrendDown, Users, Coin, ChartLineUp, Lock, LockOpen,
  Timer, Fire, CurrencyDollar, Wallet, ShieldCheck, Warning, ArrowRight,
} from "@phosphor-icons/react";

const TREASURY = new PublicKey(
  process.env.NEXT_PUBLIC_TREASURY_WALLET || "11111111111111111111111111111111"
);

/* ─── Helpers ─── */
function formatSol(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function progressPercent(dateStr: string): number {
  // Assuming 365 days lock from creation
  const lockEnd = new Date(dateStr).getTime();
  const lockStart = lockEnd - 365 * 86400000;
  const elapsed = Date.now() - lockStart;
  const total = lockEnd - lockStart;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

export default function PersonPublicPage() {
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");

  const { creator, curveData, mockPerson, isCreator } = usePerson();
  const { authenticated, login } = usePrivy();
  const { buyTokens, sellTokens } = useHumanofi();
  const { priceUsd: solPriceUsd } = useSolPrice();

  const isReal = !!creator;

  const story = creator?.story || mockPerson?.story || "";
  const offer = creator?.offer || mockPerson?.offer || "";
  const activityScore = creator?.activity_score || mockPerson?.activityScore || 0;
  const displayNameShort = (creator?.display_name || mockPerson?.name || "").split(" ")[0];

  const priceNum = curveData
    ? curveData.basePrice.toNumber() / 1e9
    : mockPerson?.priceNum || 0;

  const supplySold = curveData ? curveData.supplySold.toNumber() / 1e6 : 0;
  const solReserve = curveData ? curveData.solReserve.toNumber() / 1e9 : 0;
  const marketCap = supplySold * priceNum;

  const sparkline = mockPerson?.sparkline || Array.from({ length: 12 }, () => Math.floor(Math.random() * 18) + 3);

  const parsedAmt = parseFloat(amount) || 0;
  const estimateReceive =
    activeTab === "buy"
      ? (parsedAmt / (priceNum || 1)).toFixed(2)
      : (parsedAmt * (priceNum || 0)).toFixed(4);

  // Lock info
  const lockUntil = creator?.token_lock_until || "";
  const lockDays = lockUntil ? daysUntil(lockUntil) : 365;
  const lockProgress = lockUntil ? progressPercent(lockUntil) : 0;
  const isLocked = lockDays > 0;

  const handleTrade = useCallback(async () => {
    if (!authenticated) { login(); return; }
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) { toast.error("Enter a valid amount."); return; }
    if (!creator) { toast.error("This is a demo profile — trading not available."); return; }

    try {
      if (activeTab === "buy") {
        await buyTokens({
          mint: new PublicKey(creator.mint_address),
          solAmount: parsedAmount,
          creatorWallet: new PublicKey(creator.wallet_address),
          treasury: TREASURY,
        });
      } else {
        await sellTokens({
          mint: new PublicKey(creator.mint_address),
          tokenAmount: parsedAmount * 1_000_000,
          creatorWallet: new PublicKey(creator.wallet_address),
          treasury: TREASURY,
        });
      }
      setAmount("");
    } catch { /* handled */ }
  }, [authenticated, login, amount, creator, activeTab, buyTokens, sellTokens]);

  /* ════════════════════════════════════════════
     CREATOR DASHBOARD VIEW
     ════════════════════════════════════════════ */
  if (isCreator && isReal && creator) {
    return (
      <div className="dashboard">
        {/* ── KPI Row ── */}
        <div className="dashboard__kpi-row">
          <motion.div className="kpi-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
            <div className="kpi-card__icon" style={{ background: "rgba(99, 102, 241, 0.1)", color: "var(--accent)" }}>
              <CurrencyDollar size={20} weight="bold" />
            </div>
            <div className="kpi-card__data">
              <div className="kpi-card__label">Token Price</div>
              <div className="kpi-card__value">{formatSol(priceNum)} SOL</div>
              {solPriceUsd > 0 && <div className="kpi-card__sub">{formatUsd(solToUsd(priceNum, solPriceUsd))}</div>}
            </div>
          </motion.div>

          <motion.div className="kpi-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div className="kpi-card__icon" style={{ background: "rgba(34, 197, 94, 0.1)", color: "#22c55e" }}>
              <ChartLineUp size={20} weight="bold" />
            </div>
            <div className="kpi-card__data">
              <div className="kpi-card__label">Market Cap</div>
              <div className="kpi-card__value">{formatSol(marketCap)} SOL</div>
              {solPriceUsd > 0 && <div className="kpi-card__sub">{formatUsd(solToUsd(marketCap, solPriceUsd))}</div>}
            </div>
          </motion.div>

          <motion.div className="kpi-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="kpi-card__icon" style={{ background: "rgba(6, 182, 212, 0.1)", color: "#06b6d4" }}>
              <Users size={20} weight="bold" />
            </div>
            <div className="kpi-card__data">
              <div className="kpi-card__label">Holders</div>
              <div className="kpi-card__value">{mockPerson?.holders?.toLocaleString("en-US") || "—"}</div>
            </div>
          </motion.div>

          <motion.div className="kpi-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="kpi-card__icon" style={{ background: "rgba(245, 158, 11, 0.1)", color: "#f59e0b" }}>
              <Fire size={20} weight="bold" />
            </div>
            <div className="kpi-card__data">
              <div className="kpi-card__label">Activity Score</div>
              <div className="kpi-card__value">{activityScore}/100</div>
            </div>
          </motion.div>
        </div>

        {/* ── Main Grid: Chart + Details ── */}
        <div className="dashboard__grid">
          {/* Left: Chart + Token Info */}
          <div className="dashboard__main">
            <section className="dashboard__card">
              <div className="dashboard__card-header">
                <ChartLineUp size={16} weight="bold" /> Price History
              </div>
              <BondingCurveChart mintAddress={creator?.mint_address || mockPerson?.id} currentPrice={priceNum} change={mockPerson?.change || 0} sparkline={sparkline} height={260} />
            </section>

            <section className="dashboard__card">
              <div className="dashboard__card-header">
                <Coin size={16} weight="bold" /> Token Economics
              </div>
              <div className="dashboard__token-grid">
                <div className="dashboard__token-stat">
                  <span className="dashboard__token-label">Supply Sold</span>
                  <span className="dashboard__token-value">{supplySold.toFixed(0)} tokens</span>
                </div>
                <div className="dashboard__token-stat">
                  <span className="dashboard__token-label">SOL Reserve</span>
                  <span className="dashboard__token-value">{formatSol(solReserve)} SOL</span>
                </div>
                <div className="dashboard__token-stat">
                  <span className="dashboard__token-label">Curve Slope</span>
                  <span className="dashboard__token-value">{curveData ? (curveData.slope.toNumber() / 1e9).toFixed(6) : "—"}</span>
                </div>
                <div className="dashboard__token-stat">
                  <span className="dashboard__token-label">Mint Address</span>
                  <span className="dashboard__token-value dashboard__token-value--mono">
                    {creator.mint_address.slice(0, 6)}...{creator.mint_address.slice(-4)}
                  </span>
                </div>
              </div>
            </section>

            {/* Latest Public Post */}
            <LatestPublicPost creatorMint={creator.mint_address} />
          </div>

          {/* Right: Lock, Sell, Activity */}
          <div className="dashboard__sidebar">
            {/* ── Token Lock Card ── */}
            <section className="dashboard__card dashboard__lock-card">
              <div className="dashboard__card-header">
                {isLocked ? <Lock size={16} weight="bold" /> : <LockOpen size={16} weight="bold" />}
                Token Lock
                {isLocked && <span className="dashboard__lock-badge">LOCKED</span>}
              </div>

              <div className="dashboard__lock-progress">
                <div className="dashboard__lock-bar">
                  <div className="dashboard__lock-fill" style={{ width: `${lockProgress}%` }} />
                </div>
                <div className="dashboard__lock-info">
                  <span>{lockProgress.toFixed(0)}% elapsed</span>
                  <span>{lockDays} days left</span>
                </div>
              </div>

              {isLocked && (
                <div className="dashboard__lock-detail">
                  <Timer size={14} weight="bold" />
                  <span>
                    Unlock date: {new Date(lockUntil).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
              )}

              <div className="dashboard__lock-explain">
                <ShieldCheck size={14} weight="bold" />
                <span>Your tokens are locked to protect holders and prove long-term commitment.</span>
              </div>
            </section>

            {/* ── Sell Widget (disabled during lock) ── */}
            <section className="dashboard__card">
              <div className="dashboard__card-header">
                <Wallet size={16} weight="bold" /> Sell Tokens
              </div>
              {isLocked ? (
                <div className="dashboard__sell-locked">
                  <Lock size={32} weight="bold" />
                  <h3>Selling is locked</h3>
                  <p>You cannot sell your tokens for {lockDays} more days. This protects your holders and builds trust.</p>
                  <div className="dashboard__sell-countdown">
                    <div className="dashboard__countdown-item">
                      <span className="dashboard__countdown-num">{Math.floor(lockDays / 30)}</span>
                      <span className="dashboard__countdown-label">months</span>
                    </div>
                    <div className="dashboard__countdown-item">
                      <span className="dashboard__countdown-num">{lockDays % 30}</span>
                      <span className="dashboard__countdown-label">days</span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <input type="number" className="trade-input" placeholder="Amount to sell" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <div style={{ marginTop: 8, marginBottom: 12, fontSize: "0.75rem", fontWeight: 800, color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
                    <span>You will receive</span>
                    <span style={{ color: "var(--text)" }}>~{(parsedAmt * priceNum).toFixed(4)} SOL{solPriceUsd > 0 ? ` (${formatUsd(solToUsd(parsedAmt * priceNum, solPriceUsd))})` : ""}</span>
                  </div>
                  <button className="btn-solid" style={{ width: "100%", background: "#e53e3e" }} onClick={handleTrade}>
                    Execute Sell
                  </button>
                </>
              )}
            </section>

            {/* ── Activity Score Card ── */}
            <section className="dashboard__card">
              <div className="dashboard__card-header">
                <Fire size={16} weight="bold" /> Activity Score
              </div>
              <div className="dashboard__score-ring">
                <svg viewBox="0 0 120 120" className="dashboard__score-svg">
                  <circle cx="60" cy="60" r="50" stroke="var(--border-light)" strokeWidth="8" fill="none" />
                  <circle cx="60" cy="60" r="50" stroke={activityScore >= 70 ? "#22c55e" : activityScore >= 40 ? "#f59e0b" : "#e53e3e"} strokeWidth="8" fill="none"
                    strokeDasharray={`${(activityScore / 100) * 314} 314`} strokeLinecap="round"
                    transform="rotate(-90 60 60)" style={{ transition: "stroke-dasharray 0.6s ease" }}
                  />
                  <text x="60" y="55" textAnchor="middle" fontSize="28" fontWeight="900" fill="var(--text)">{activityScore}</text>
                  <text x="60" y="72" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--text-muted)">/ 100</text>
                </svg>
              </div>
              <div className="dashboard__score-tips">
                <div className="dashboard__tip">
                  <span>Post regularly</span>
                  <ArrowRight size={10} />
                  <span>+5 per post</span>
                </div>
                <div className="dashboard__tip">
                  <span>Answer questions</span>
                  <ArrowRight size={10} />
                  <span>+3 per answer</span>
                </div>
                <div className="dashboard__tip">
                  <span>Host events</span>
                  <ArrowRight size={10} />
                  <span>+10 per event</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════
     PUBLIC VISITOR VIEW (Profile & Trade)
     ════════════════════════════════════════════ */
  return (
    <div className="profile-grid">
      <div className="profile-main">
        <section className="profile-section">
          <h2 className="profile-section__title">The Story</h2>
          <p className="profile-section__text">{story || "No story yet."}</p>
        </section>

        <section className="profile-section">
          <h2 className="profile-section__title">What I Offer (Inner Circle)</h2>
          <p className="profile-section__text">{offer || "No offer description yet."}</p>
        </section>

        <section className="profile-section">
          <BondingCurveChart mintAddress={creator?.mint_address || mockPerson?.id} currentPrice={priceNum} change={mockPerson?.change || 0} sparkline={sparkline} height={220} />
        </section>

        {isReal && creator && <LatestPublicPost creatorMint={creator.mint_address} />}
      </div>

      <div className="profile-sidebar">
        <div className="profile__stats-grid">
          <div className="stat-card">
            <div className="stat-card__lbl">Price</div>
            <div className="stat-card__val">{curveData ? `${priceNum.toFixed(4)} SOL` : mockPerson?.price || "—"}</div>
            {solPriceUsd > 0 && <div className="stat-card__sub">{formatUsd(solToUsd(priceNum, solPriceUsd))}</div>}
          </div>
          <div className="stat-card">
            <div className="stat-card__lbl">Activity Score</div>
            <div className="stat-card__val">{activityScore}/100</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__lbl">Market Cap</div>
            <div className="stat-card__val">{curveData ? `${marketCap.toFixed(2)} SOL` : mockPerson?.marketCap || "—"}</div>
            {solPriceUsd > 0 && <div className="stat-card__sub">{formatUsd(solToUsd(marketCap, solPriceUsd))}</div>}
          </div>
          <div className="stat-card">
            <div className="stat-card__lbl">Holders</div>
            <div className="stat-card__val">{mockPerson?.holders?.toLocaleString("en-US") || "—"}</div>
          </div>
        </div>

        <div className="trade-widget">
          <div className="trade-widget__info">
            <div style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase" }}>{isReal ? "Trade" : "Demo Mode"}</div>
            <div style={{ marginLeft: "auto", fontWeight: 800 }}>{isReal ? `${activityScore}/100` : "—"}</div>
          </div>

          <div className="trade-widget__tabs">
            <button className={`trade-tab ${activeTab === "buy" ? "active" : ""}`} onClick={() => setActiveTab("buy")}>Buy</button>
            <button className={`trade-tab ${activeTab === "sell" ? "active" : ""}`} onClick={() => setActiveTab("sell")}>Sell</button>
          </div>

          {activeTab === "buy" && isReal && (
            <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: "0.72rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
              <span style={{ fontWeight: 700, color: "var(--accent)" }}>ⓘ Anti-manipulation limits</span><br />
              Week 1: max <strong style={{ color: "var(--text)" }}>1 SOL/day</strong> ·
              Month 1: max <strong style={{ color: "var(--text)" }}>5 SOL/day</strong> ·
              After: max <strong style={{ color: "var(--text)" }}>20 SOL/day</strong>
            </div>
          )}

          <div style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", marginBottom: 8, color: "var(--text-muted)" }}>
            {activeTab === "buy" ? "Amount in SOL" : `Amount of ${displayNameShort.toUpperCase()}`}
          </div>
          <input type="number" className="trade-input" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} max={activeTab === "buy" ? "1" : undefined} />

          {activeTab === "buy" && parseFloat(amount) > 1 && (
            <div style={{ background: "rgba(229,62,62,0.1)", border: "1px solid rgba(229,62,62,0.3)", borderRadius: 8, padding: "8px 12px", marginTop: 8, marginBottom: 4, fontSize: "0.72rem", color: "#e53e3e", fontWeight: 600 }}>
              ⚠ This amount exceeds the Week 1 daily limit (1 SOL/day)
            </div>
          )}

          <div style={{ marginBottom: 16, fontSize: "0.75rem", fontWeight: 800, color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
            <span>You will {activeTab === "buy" ? "receive" : "get"}</span>
            <span style={{ color: "var(--text)" }}>~{estimateReceive} {activeTab === "buy" ? "tokens" : "SOL"}{activeTab === "sell" && solPriceUsd > 0 ? ` (${formatUsd(solToUsd(parseFloat(estimateReceive) || 0, solPriceUsd))})` : ""}</span>
          </div>

          <button className="btn-solid" style={{ width: "100%", background: activeTab === "buy" ? "var(--accent)" : "var(--down, #e53e3e)", opacity: isReal ? 1 : 0.5 }} onClick={handleTrade} disabled={!isReal}>
            {!authenticated ? "Connect Wallet" : !isReal ? "Demo — Create a Token First" : activeTab === "buy" ? "Execute Buy" : "Execute Sell"}
          </button>
        </div>

        <div style={{ marginTop: 24, fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
          <strong>Lock Info:</strong> {displayNameShort} can only unlock 20% of their supply initially. Their interests are aligned long-term.
        </div>
      </div>
    </div>
  );
}

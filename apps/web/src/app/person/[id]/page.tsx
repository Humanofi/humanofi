"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import BondingCurveChart, { type BondingCurveChartHandle } from "@/components/BondingCurveChart";
import TradeModal, { type TradeStep } from "@/components/TradeModal";
import TradeWidget from "@/components/TradeWidget";
import { usePrivy } from "@privy-io/react-auth";
import { useHumanofi } from "@/hooks/useHumanofi";
import { useSolPrice } from "@/hooks/useSolPrice";
import { formatUsd, solToUsd, spotPrice, estimateBuy, estimateSell } from "@/lib/price";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import { usePerson } from "./layout";
import LatestPublicPost from "@/components/public-feed/LatestPublicPost";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  TrendUp, TrendDown, Users, Coin, ChartLineUp, Lock, LockOpen,
  Timer, Fire, CurrencyDollar, Wallet, ShieldCheck,
  YoutubeLogo, Images, Lightning, Heartbeat,
} from "@phosphor-icons/react";

const TREASURY = new PublicKey(
  process.env.NEXT_PUBLIC_TREASURY_WALLET || "11111111111111111111111111111111"
);

/* ─── Helpers ─── */
function formatSol(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.0001) return n.toFixed(4);
  if (n >= 0.000001) return n.toFixed(6);
  if (n > 0) return n.toExponential(2);
  return "0";
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function progressPercent(dateStr: string): number {
  const lockEnd = new Date(dateStr).getTime();
  const lockStart = lockEnd - 365 * 86400000;
  const elapsed = Date.now() - lockStart;
  const total = lockEnd - lockStart;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

/** Extract YouTube embed URL from various formats */
function getYouTubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

export default function PersonPublicPage() {
  // Trade state (managed by TradeWidget, only modal state here)
  const [tradeActiveTab, setTradeActiveTab] = useState<"buy" | "sell">("buy");
  const [tradeAmount, setTradeAmount] = useState(0);

  const { creator, curveData, liveCurve, mockPerson, isCreator, tokenColor, refreshCurve, chartRef } = usePerson();
  const { authenticated, login } = usePrivy();
  const { buyTokens, sellTokens, claimCreatorFees, fetchCreatorFeeVault, walletAddress } = useHumanofi();
  const { priceUsd: solPriceUsd } = useSolPrice();

  // Trade modal state
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradeStep, setTradeStep] = useState<TradeStep>("idle");
  const [tradeTxSig, setTradeTxSig] = useState<string | undefined>();
  const [tradeError, setTradeError] = useState<string | undefined>();

  const isReal = !!creator;

  const story = creator?.story || mockPerson?.story || "";
  const offer = creator?.offer || mockPerson?.offer || "";
  const activityScore = creator?.activity_score || mockPerson?.activityScore || 0;
  const activityStatus = creator?.activity_status || "moderate";
  const displayNameShort = (creator?.display_name || mockPerson?.name || "").split(" ")[0];

  // Use live WebSocket data if available, fallback to initial fetch
  const rawX = liveCurve ? liveCurve.x : curveData ? curveData.x.toNumber() : 0;
  const rawY = liveCurve ? liveCurve.y : curveData ? curveData.y.toNumber() : 0;
  const rawK = liveCurve ? Number(liveCurve.k) : curveData ? Number(curveData.k.toString()) : 0;

  const priceNum = liveCurve ? liveCurve.priceSol
    : curveData ? (curveData.x.toNumber() / curveData.y.toNumber()) * 1e6 / 1e9
    : mockPerson?.priceNum || 0;

  const supplyPublic = liveCurve ? liveCurve.supplyPublic / 1e6 : curveData ? curveData.supplyPublic.toNumber() / 1e6 : 0;
  const supplyCreator = liveCurve ? liveCurve.supplyCreator / 1e6 : curveData ? curveData.supplyCreator.toNumber() / 1e6 : 0;
  const supplyProtocol = liveCurve ? liveCurve.supplyProtocol / 1e6 : curveData ? curveData.supplyProtocol.toNumber() / 1e6 : 0;
  const totalSupply = supplyPublic + supplyCreator + supplyProtocol;
  const solReserve = liveCurve ? liveCurve.solReserve / 1e9 : curveData ? curveData.solReserve.toNumber() / 1e9 : 0;
  const marketCap = totalSupply > 0 ? totalSupply * priceNum : solReserve;



  // Lock info
  const lockUntil = creator?.token_lock_until || "";
  const lockDays = lockUntil ? daysUntil(lockUntil) : 365;
  const lockProgress = lockUntil ? progressPercent(lockUntil) : 0;

  // YouTube embed
  const youtubeEmbed = getYouTubeEmbedUrl(creator?.youtube_url || "");

  // Gallery
  const gallery = creator?.gallery_urls || [];

  // Score ring
  const scoreColor = activityScore >= 85 ? "#22c55e" : activityScore >= 65 ? "#3b82f6" : activityScore >= 45 ? "#f59e0b" : activityScore >= 25 ? "#ef4444" : "#6b7280";
  const scoreLabel = activityScore >= 85 ? "Thriving" : activityScore >= 65 ? "Active" : activityScore >= 45 ? "Moderate" : activityScore >= 25 ? "Low" : "Dormant";

  // ── Creator Fee Vault state ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [feeVault, setFeeVault] = useState<any>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!isCreator || !creator?.mint_address || !fetchCreatorFeeVault) return;
    fetchCreatorFeeVault(new PublicKey(creator.mint_address)).then(setFeeVault).catch(() => {});
  }, [isCreator, creator?.mint_address, fetchCreatorFeeVault]);

  const feeAccumulatedSol = feeVault ? Number(feeVault.totalAccumulated?.toString?.() || feeVault.totalAccumulated || 0) / 1e9 : 0;
  const feeClaimedSol = feeVault ? Number(feeVault.totalClaimed?.toString?.() || feeVault.totalClaimed || 0) / 1e9 : 0;
  const feeUnclaimedSol = feeAccumulatedSol - feeClaimedSol;
  const lastClaimAt = feeVault ? Number(feeVault.lastClaimAt?.toString?.() || feeVault.lastClaimAt || 0) : 0;
  const CLAIM_COOLDOWN = 15 * 24 * 60 * 60; // 15 days in seconds
  const now = Math.floor(Date.now() / 1000);
  const nextClaimAt = lastClaimAt > 0 ? lastClaimAt + CLAIM_COOLDOWN : 0;
  const canClaimNow = lastClaimAt === 0 || now >= nextClaimAt;
  const daysUntilClaim = canClaimNow ? 0 : Math.ceil((nextClaimAt - now) / 86400);

  const handleClaimFees = useCallback(async () => {
    if (!creator?.mint_address || !claimCreatorFees || claiming) return;
    setClaiming(true);
    try {
      const sig = await claimCreatorFees(new PublicKey(creator.mint_address));
      if (sig) {
        // Immediately update UI to show 0 unclaimed (optimistic update)
        setFeeVault((prev: Record<string, unknown> | null) => prev ? {
          ...prev,
          totalClaimed: prev.totalAccumulated,
          lastClaimAt: Math.floor(Date.now() / 1000),
        } : prev);
      }
      // Then confirm with on-chain data after a delay
      setTimeout(async () => {
        try {
          const updated = await fetchCreatorFeeVault(new PublicKey(creator!.mint_address));
          if (updated) setFeeVault(updated);
        } catch { /* ignore */ }
        setClaiming(false);
      }, 5000);
    } catch {
      setClaiming(false);
    }
  }, [creator?.mint_address, claimCreatorFees, fetchCreatorFeeVault, claiming]);

  /** Record a verified trade in Supabase */
  const recordTrade = useCallback(async (txSig: string, tradeType: "buy" | "sell", solAmt: number, tokenAmt: number) => {
    if (!creator || !walletAddress) return;
    try {
      // Wait for on-chain state to update
      await new Promise(r => setTimeout(r, 2000));
      await refreshCurve();

      // Read fresh price from live curve
      const freshPrice = liveCurve?.priceSol || priceNum;

      await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mintAddress: creator.mint_address,
          tradeType,
          walletAddress,
          solAmount: Math.floor(solAmt * 1e9),
          tokenAmount: Math.floor(tokenAmt * 1e6),
          priceSol: freshPrice,
          txSignature: txSig,
          xAfter: rawX,
          yAfter: rawY,
          kAfter: rawK,
          solReserve: Math.floor(solReserve * 1e9),
          supplyPublic: Math.floor(supplyPublic * 1e6),
        }),
      });
    } catch (err) {
      console.warn("[Trade] Failed to record:", err);
    }
  }, [creator, walletAddress, refreshCurve, liveCurve, priceNum, rawX, rawY, rawK, solReserve, supplyPublic]);

  const handleTrade = useCallback(async (tab: "buy" | "sell", parsedAmount: number) => {
    if (!authenticated) { login(); return; }
    if (!parsedAmount || parsedAmount <= 0) { toast.error("Enter a valid amount."); return; }
    if (!creator) { toast.error("This is a demo profile — trading not available."); return; }

    setTradeActiveTab(tab);
    setTradeAmount(parsedAmount);

    // Open modal
    setTradeModalOpen(true);
    setTradeStep("signing");
    setTradeTxSig(undefined);
    setTradeError(undefined);

    try {
      let txSig: string | null = null;

      if (tab === "buy") {
        txSig = await buyTokens({
          mint: new PublicKey(creator.mint_address),
          solAmount: parsedAmount,
          creatorWallet: new PublicKey(creator.wallet_address),
          treasury: TREASURY,
        });
      } else {
        txSig = await sellTokens({
          mint: new PublicKey(creator.mint_address),
          tokenAmount: parsedAmount * 1_000_000,
          creatorWallet: new PublicKey(creator.wallet_address),
          treasury: TREASURY,
        });
      }

      if (!txSig) {
        setTradeStep("error");
        setTradeError("Transaction was not signed.");
        return;
      }

      setTradeStep("confirming");
      setTradeTxSig(txSig);
      setTradeStep("verifying");

      const tokenAmt = tab === "buy" ? parsedAmount / (priceNum || 1) : parsedAmount;
      await recordTrade(txSig, tab, parsedAmount, tokenAmt);

      setTradeStep("complete");

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTradeStep("error");
      setTradeError(msg);
    }
  }, [authenticated, login, creator, buyTokens, sellTokens, recordTrade, priceNum]);

  /* ════════════════════════════════════════════
     CREATOR DASHBOARD VIEW
     ════════════════════════════════════════════ */
  if (isCreator && isReal && creator) {
    return (
      <div className="dashboard">
        {/* ── KPI Row ── */}
        <div className="dashboard__kpi-row">
          <motion.div className="kpi-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
            <div className="kpi-card__icon" style={{ background: `${tokenColor}15`, color: tokenColor }}>
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
            <div className="kpi-card__icon" style={{ background: `${scoreColor}15`, color: scoreColor }}>
              <Fire size={20} weight="bold" />
            </div>
            <div className="kpi-card__data">
              <div className="kpi-card__label">Activity Score</div>
              <div className="kpi-card__value">{activityScore}/100</div>
              <div className="kpi-card__sub" style={{ color: scoreColor }}>{scoreLabel}</div>
            </div>
          </motion.div>
        </div>

        {/* ── Main Grid: Chart + Details ── */}
        <div className="dashboard__grid">
          <div className="dashboard__main">
            <section className="dashboard__card">
              <div className="dashboard__card-header">
                <ChartLineUp size={16} weight="bold" /> Price History
              </div>
              <BondingCurveChart ref={chartRef} mintAddress={creator.mint_address} currentPrice={priceNum} height={260} />
            </section>

            <section className="dashboard__card">
              <div className="dashboard__card-header">
                <Coin size={16} weight="bold" /> Token Economics
              </div>
              <div className="dashboard__token-grid">
                <div className="dashboard__token-stat">
                  <span className="dashboard__token-label">Supply (Public)</span>
                  <span className="dashboard__token-value">{curveData ? (curveData.supplyPublic.toNumber() / 1e6).toFixed(0) : "—"} tokens</span>
                </div>
                <div className="dashboard__token-stat">
                  <span className="dashboard__token-label">SOL Reserve</span>
                  <span className="dashboard__token-value">{formatSol(solReserve)} SOL</span>
                </div>
                <div className="dashboard__token-stat">
                  <span className="dashboard__token-label">Creator Merit</span>
                  <span className="dashboard__token-value">{curveData ? (curveData.supplyCreator.toNumber() / 1e6).toFixed(0) : "—"} tokens</span>
                </div>
                <div className="dashboard__token-stat">
                  <span className="dashboard__token-label">Mint Address</span>
                  <span className="dashboard__token-value dashboard__token-value--mono">
                    {creator.mint_address.slice(0, 6)}...{creator.mint_address.slice(-4)}
                  </span>
                </div>
              </div>
            </section>

            {/* ── Creator Fee Revenue Card ── */}
            <section className="dashboard__card" style={{ borderLeft: `3px solid #22c55e` }}>
              <div className="dashboard__card-header">
                <Wallet size={16} weight="bold" /> Fee Revenue (3% of trades)
              </div>
              <div className="dashboard__token-grid">
                <div className="dashboard__token-stat">
                  <span className="dashboard__token-label">Total Earned</span>
                  <span className="dashboard__token-value" style={{ color: "#22c55e" }}>
                    {formatSol(feeAccumulatedSol)} SOL
                  </span>
                  {solPriceUsd > 0 && <span className="dashboard__token-label">{formatUsd(solToUsd(feeAccumulatedSol, solPriceUsd))}</span>}
                </div>
                <div className="dashboard__token-stat">
                  <span className="dashboard__token-label">Already Claimed</span>
                  <span className="dashboard__token-value">{formatSol(feeClaimedSol)} SOL</span>
                </div>
                <div className="dashboard__token-stat">
                  <span className="dashboard__token-label">Available to Claim</span>
                  <span className="dashboard__token-value" style={{ color: feeUnclaimedSol > 0 ? "#22c55e" : "var(--text-muted)", fontWeight: 900 }}>
                    {formatSol(feeUnclaimedSol)} SOL
                  </span>
                  {solPriceUsd > 0 && feeUnclaimedSol > 0 && <span className="dashboard__token-label">{formatUsd(solToUsd(feeUnclaimedSol, solPriceUsd))}</span>}
                </div>
                <div className="dashboard__token-stat" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span className="dashboard__token-label">Claim Cooldown</span>
                  {canClaimNow ? (
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#22c55e" }}>✅ Ready to claim</span>
                  ) : (
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#f59e0b" }}>
                      ⏳ {daysUntilClaim} days remaining
                    </span>
                  )}
                </div>
              </div>

              {/* Claim button */}
              <button
                onClick={handleClaimFees}
                disabled={!canClaimNow || feeUnclaimedSol <= 0 || claiming}
                style={{
                  width: "100%",
                  marginTop: 16,
                  padding: "12px 0",
                  fontWeight: 800,
                  fontSize: "0.85rem",
                  border: "2px solid #22c55e",
                  background: canClaimNow && feeUnclaimedSol > 0 ? "#22c55e" : "transparent",
                  color: canClaimNow && feeUnclaimedSol > 0 ? "#fff" : "var(--text-muted)",
                  cursor: canClaimNow && feeUnclaimedSol > 0 && !claiming ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                  opacity: claiming ? 0.6 : 1,
                }}
              >
                <Wallet size={16} weight="bold" style={{ marginRight: 8, verticalAlign: "middle" }} />
                {claiming ? "Claiming..." : feeUnclaimedSol <= 0 ? "No fees to claim" : canClaimNow ? `Claim ${formatSol(feeUnclaimedSol)} SOL` : `Cooldown — ${daysUntilClaim} days`}
              </button>

              <div style={{ marginTop: 12, fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                <Lightning size={12} weight="bold" style={{ verticalAlign: "middle", marginRight: 4 }} />
                You earn 3% of every buy/sell as SOL fees. Claimable every 15 days directly to your wallet.
              </div>
            </section>

            <LatestPublicPost creatorMint={creator.mint_address} />
          </div>

          {/* Right: Lock, Sell, Activity */}
          <div className="dashboard__sidebar">
            {/* ── Token Lock Card ── */}
            <section className="dashboard__card dashboard__lock-card">
              <div className="dashboard__card-header">
                <Lock size={16} weight="bold" />
                Token Lock
                <span className="dashboard__lock-badge">LOCKED</span>
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

              {lockUntil && (
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

            {/* ── Activity Score Card ── */}
            <section className="dashboard__card">
              <div className="dashboard__card-header">
                <Fire size={16} weight="bold" /> Activity Score
              </div>
              <div className="dashboard__score-ring">
                <svg viewBox="0 0 120 120" className="dashboard__score-svg">
                  <circle cx="60" cy="60" r="50" stroke="var(--border-light)" strokeWidth="8" fill="none" />
                  <circle cx="60" cy="60" r="50" stroke={scoreColor} strokeWidth="8" fill="none"
                    strokeDasharray={`${(activityScore / 100) * 314} 314`} strokeLinecap="round"
                    transform="rotate(-90 60 60)" style={{ transition: "stroke-dasharray 0.6s ease" }}
                  />
                  <text x="60" y="55" textAnchor="middle" fontSize="28" fontWeight="900" fill="var(--text)">{activityScore}</text>
                  <text x="60" y="72" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--text-muted)">/ 100</text>
                </svg>
              </div>
              <div className="dashboard__score-breakdown">
                <div className="dashboard__score-row">
                  <span className="dashboard__score-row-label">Regularity</span>
                  <div className="dashboard__score-row-bar">
                    <div style={{ width: `${((creator?.regularity_score || 0) / 30) * 100}%`, background: "#3b82f6" }} />
                  </div>
                  <span className="dashboard__score-row-val">{creator?.regularity_score || 0}/30</span>
                </div>
                <div className="dashboard__score-row">
                  <span className="dashboard__score-row-label">Engagement</span>
                  <div className="dashboard__score-row-bar">
                    <div style={{ width: `${((creator?.engagement_score || 0) / 40) * 100}%`, background: "#22c55e" }} />
                  </div>
                  <span className="dashboard__score-row-val">{creator?.engagement_score || 0}/40</span>
                </div>
                <div className="dashboard__score-row">
                  <span className="dashboard__score-row-label">Retention</span>
                  <div className="dashboard__score-row-bar">
                    <div style={{ width: `${((creator?.retention_score || 0) / 30) * 100}%`, background: "#f59e0b" }} />
                  </div>
                  <span className="dashboard__score-row-val">{creator?.retention_score || 0}/30</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════
     PUBLIC VISITOR / HOLDER VIEW
     Trade-first layout with rich profile
     ════════════════════════════════════════════ */
  return (
    <div className="profile-grid">
      {/* ── SIDEBAR: Trade Widget (sticky) + Score ── */}
      <div className="profile-sidebar">
        {/* Trade Widget — FIRST, most visible */}
        <TradeWidget
          tokenColor={tokenColor}
          displayName={creator?.display_name || mockPerson?.name || "Token"}
          priceNum={priceNum}
          mintAddress={creator?.mint_address}
          isReal={isReal}
          authenticated={authenticated}
          rawX={rawX}
          rawY={rawY}
          rawK={rawK}
          hasCurveData={!!curveData}
          onTrade={handleTrade}
          onLogin={login}
        />


        {/* How it works — trust & fairness */}
        <div className="protection-widget">
          <div className="protection-widget__item">
            <Users size={20} weight="bold" style={{ color: tokenColor, flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Fair access for everyone</strong>
              <p>Thanks to The Human Curve™, the market grows more stable with volume. 6% fees ensure sustainable growth for everyone.</p>
            </div>
          </div>
          <div className="protection-widget__item">
            <Lock size={20} weight="bold" style={{ color: tokenColor, flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>{displayNameShort} is committed long-term</strong>
              <p>{displayNameShort} cannot sell their own tokens for the first year. After that, each sale is limited to 5% price impact with a 30-day cooldown. You as a supporter can sell anytime.</p>
            </div>
          </div>
          {isCreator && lockUntil && (
            <div className="protection-widget__item">
              <Timer size={20} weight="bold" style={{ color: tokenColor, flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Your lock progress</strong>
                <div className="protection-widget__bar">
                  <div style={{ width: `${lockProgress}%`, background: tokenColor }} />
                </div>
                <p>{lockProgress.toFixed(0)}% elapsed — {lockDays} days remaining</p>
              </div>
            </div>
          )}
          <div className="protection-widget__item">
            <Lightning size={20} weight="bold" style={{ color: tokenColor, flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>A closed, trusted ecosystem</strong>
              <p>Tokens live exclusively on Humanofi. No external exchanges, no transfers between wallets. The token is the key to {displayNameShort}&apos;s world — and that access stays here.</p>
            </div>
          </div>
          <div className="protection-widget__safe">
            Humanofi is a safe place. Every rule above is enforced by code, not promises. Your support goes directly to the person you believe in.
          </div>
        </div>
      </div>

      {/* ── MAIN: Chart, Video, Story, Gallery ── */}
      <div className="profile-main">
        {/* Chart */}
        <section className="profile-section">
          <BondingCurveChart ref={chartRef} mintAddress={creator?.mint_address || mockPerson?.id} currentPrice={priceNum} height={260} />
        </section>

        {/* YouTube Video */}
        {youtubeEmbed && (
          <motion.section className="profile-section" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <h2 className="profile-section__title">
              <YoutubeLogo size={20} weight="bold" style={{ color: "#ff0000" }} /> Video
            </h2>
            <div className="profile-video-embed">
              <iframe
                src={youtubeEmbed}
                title="Creator video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </motion.section>
        )}

        {/* The Story */}
        <section className="profile-section">
          <h2 className="profile-section__title">The Story</h2>
          <p className="profile-section__text">{story || "No story yet."}</p>
        </section>

        {/* What I Offer */}
        <section className="profile-section">
          <h2 className="profile-section__title">What I Offer (Inner Circle)</h2>
          <p className="profile-section__text">{offer || "No offer description yet."}</p>
        </section>

        {/* Gallery */}
        {gallery.length > 0 && (
          <motion.section className="profile-section" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
            <h2 className="profile-section__title">
              <Images size={20} weight="bold" /> Gallery
            </h2>
            <div className="profile-gallery">
              {gallery.map((url, i) => (
                <div key={i} className="profile-gallery__item">
                  <Image src={url} alt={`Gallery ${i + 1}`} width={400} height={300} style={{ objectFit: "cover", width: "100%", height: "100%" }} />
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Token Economics */}
        {isReal && creator && (
          <section className="profile-section">
            <h2 className="profile-section__title">
              <Coin size={20} weight="bold" /> Token Economics
            </h2>
            <div className="profile-token-grid">
              <div className="profile-token-stat">
                <span>Supply (Public)</span>
                <strong>{curveData ? (curveData.supplyPublic.toNumber() / 1e6).toFixed(0) : "—"} tokens</strong>
              </div>
              <div className="profile-token-stat">
                <span>SOL Reserve</span>
                <strong>{formatSol(solReserve)} SOL</strong>
              </div>
              <div className="profile-token-stat">
                <span>Mint</span>
                <strong style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{creator.mint_address.slice(0, 8)}...{creator.mint_address.slice(-6)}</strong>
              </div>
            </div>
          </section>
        )}

        {/* Latest Public Post */}
        {isReal && creator && <LatestPublicPost creatorMint={creator.mint_address} />}
      </div>

      {/* ── Trade Processing Modal ─ */}
      <TradeModal
        isOpen={tradeModalOpen}
        step={tradeStep}
        tradeType={tradeActiveTab}
        amount={String(tradeAmount)}
        tokenSymbol={creator?.display_name?.split(" ")[0] || mockPerson?.name?.split(" ")[0] || "TOKEN"}
        txSignature={tradeTxSig}
        errorMessage={tradeError}
        onClose={() => {
          setTradeModalOpen(false);
          setTradeStep("idle");
        }}
      />
    </div>
  );
}

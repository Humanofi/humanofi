"use client";

import { useState, useEffect, useCallback } from "react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import Image from "next/image";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useHumanofi } from "@/hooks/useHumanofi";
import { useSolPrice } from "@/hooks/useSolPrice";
import { formatUsd, solToUsd, estimateSell } from "@/lib/price";
import { PublicKey } from "@solana/web3.js";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendUp, TrendDown, Wallet, ChartLineUp, Users,
  ArrowRight, Heartbeat, Coin, Lightning,
} from "@phosphor-icons/react";

/* ─── Color Palette ─── */
const TOKEN_COLORS: Record<string, string> = {
  blue: "#1144ff",
  violet: "#7c3aed",
  emerald: "#059669",
  orange: "#ea580c",
  crimson: "#dc2626",
  cyan: "#0891b2",
  amber: "#d97706",
  pink: "#db2777",
};

/* ─── Helpers ─── */
function formatSol(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.0001) return n.toFixed(4);
  if (n >= 0.000001) return n.toFixed(6);
  if (n > 0) return n.toExponential(2);
  return "0";
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/* ─── Position interface ─── */
interface Position {
  mint_address: string;
  balance: number;
  sol_invested: number;
  sol_recovered: number;
  tokens_bought: number;
  avg_entry_price: number;
  buy_count: number;
  sell_count: number;
  first_bought_at: string;
  last_trade_at: string;
  display_name: string;
  avatar_url: string | null;
  category: string;
  token_color: string;
  activity_score: number;
  activity_status: string;
  // Enriched client-side
  current_price?: number;
  value_sol?: number;
  pnl_sol?: number;
  pnl_pct?: number;
}

export default function PortfolioPage() {
  const { authenticated, login } = usePrivy();
  const { walletAddress, fetchBondingCurve } = useHumanofi();
  const { priceUsd: solPriceUsd } = useSolPrice();

  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [pricesLoaded, setPricesLoaded] = useState(false);

  // ── 1. Fetch positions from API ──
  useEffect(() => {
    if (!walletAddress) {
      setPositions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`/api/portfolio?wallet=${walletAddress}`)
      .then(r => r.json())
      .then(data => {
        setPositions(data.positions || []);
        setLoading(false);
      })
      .catch(() => {
        setPositions([]);
        setLoading(false);
      });
  }, [walletAddress]);

  // ── 2. Enrich with LIQUIDATION VALUES (client-side, batch) ──
  // Uses estimateSell() — the REAL SOL you'd get by selling (after fees + slippage)
  const enrichPrices = useCallback(async () => {
    if (positions.length === 0 || !fetchBondingCurve) return;

    const enriched = await Promise.all(
      positions.map(async (pos) => {
        try {
          const curve = await fetchBondingCurve(new PublicKey(pos.mint_address));
          if (!curve) return pos;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const c = curve as any;
          const x = c.x.toNumber();
          const y = c.y.toNumber();
          const k = Number(c.k.toString());
          const currentPrice = (x / y) * 1e6 / 1e9; // spot price (display only)

          // LIQUIDATION VALUE: what you'd actually get by selling all your tokens
          const sellEst = estimateSell(x, y, k, pos.balance);
          const valueSol = sellEst.solNet / 1e9; // SOL net after fees + slippage

          const investedSol = pos.sol_invested / 1e9;
          const recoveredSol = pos.sol_recovered / 1e9;
          const pnlSol = valueSol + recoveredSol - investedSol;
          const pnlPct = investedSol > 0 ? (pnlSol / investedSol) * 100 : 0;

          return {
            ...pos,
            current_price: currentPrice,
            value_sol: valueSol,
            pnl_sol: pnlSol,
            pnl_pct: pnlPct,
          };
        } catch {
          return pos;
        }
      })
    );

    setPositions(enriched);
    setPricesLoaded(true);
  }, [positions, fetchBondingCurve]);

  useEffect(() => {
    if (!loading && positions.length > 0 && !pricesLoaded) {
      enrichPrices();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, positions.length, pricesLoaded]);

  // ── Totals ──
  const totalValueSol = positions.reduce((sum, p) => sum + (p.value_sol || 0), 0);
  const totalInvestedSol = positions.reduce((sum, p) => sum + p.sol_invested / 1e9, 0);
  const totalRecoveredSol = positions.reduce((sum, p) => sum + p.sol_recovered / 1e9, 0);
  const totalPnlSol = totalValueSol + totalRecoveredSol - totalInvestedSol;
  const totalPnlPct = totalInvestedSol > 0 ? (totalPnlSol / totalInvestedSol) * 100 : 0;
  const totalPnlColor = totalPnlSol >= 0 ? "#22c55e" : "#ef4444";

  // ── Not connected ──
  if (!authenticated || !walletAddress) {
    return (
      <>
        <div className="halftone-bg" />
        <Topbar />
        <main className="page" style={{ textAlign: "center", paddingTop: 120, minHeight: "60vh" }}>
          <Wallet size={48} weight="bold" style={{ color: "var(--text-muted)", marginBottom: 16 }} />
          <h1 className="page__title" style={{ marginBottom: 8 }}>My Humans</h1>
          <p style={{ color: "var(--text-muted)", fontWeight: 600, marginBottom: 24 }}>
            Connect your wallet to see your portfolio
          </p>
          <button className="btn-solid" onClick={login}>Connect Wallet</button>
        </main>
        <Footer />
      </>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <>
        <div className="halftone-bg" />
        <Topbar />
        <main className="page" style={{ textAlign: "center", paddingTop: 120, minHeight: "60vh" }}>
          <div style={{ fontSize: "1.2rem", fontWeight: 800 }}>Loading your portfolio...</div>
        </main>
        <Footer />
      </>
    );
  }

  // ── Empty portfolio ──
  if (positions.length === 0) {
    return (
      <>
        <div className="halftone-bg" />
        <Topbar />
        <main className="page" style={{ textAlign: "center", paddingTop: 100, minHeight: "60vh" }}>
          <Users size={56} weight="bold" style={{ color: "var(--text-muted)", marginBottom: 16 }} />
          <h1 className="page__title" style={{ marginBottom: 8 }}>No humans yet</h1>
          <p style={{ color: "var(--text-muted)", fontWeight: 600, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
            You haven&apos;t backed any humans yet. Explore the marketplace to discover talented people and invest in their potential.
          </p>
          <Link href="/" className="btn-solid">Explore Marketplace</Link>
        </main>
        <Footer />
      </>
    );
  }

  // ── Portfolio view ──
  return (
    <>
      <div className="halftone-bg" />
      <Topbar />

      <main className="page" style={{ paddingTop: 40, maxWidth: 900 }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h1 className="page__title" style={{ marginBottom: 4 }}>
                <Heartbeat size={28} weight="bold" style={{ verticalAlign: "middle", marginRight: 8 }} />
                My Humans
              </h1>
              <p style={{ color: "var(--text-muted)", fontWeight: 700, fontSize: "0.85rem" }}>
                {positions.length} {positions.length === 1 ? "person" : "people"} in your circle
              </p>
            </div>

            {/* Total value card */}
            <div style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border-light)",
              padding: "16px 24px",
              borderRadius: 8,
              minWidth: 220,
              textAlign: "right",
            }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Sell Value
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 900 }}>
                {formatSol(totalValueSol)} SOL
              </div>
              {solPriceUsd > 0 && (
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-muted)" }}>
                  ~{formatUsd(solToUsd(totalValueSol, solPriceUsd))}
                </div>
              )}

              {/* P&L */}
              <div style={{
                marginTop: 8, paddingTop: 8,
                borderTop: "1px solid var(--border-light)",
                display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8,
              }}>
                {totalPnlSol >= 0 ? <TrendUp size={18} weight="bold" color={totalPnlColor} /> : <TrendDown size={18} weight="bold" color={totalPnlColor} />}
                <div>
                  <div style={{ fontSize: "0.9rem", fontWeight: 900, color: totalPnlColor }}>
                    {totalPnlSol >= 0 ? "+" : ""}{formatSol(totalPnlSol)} SOL
                    <span style={{ fontSize: "0.75rem", opacity: 0.8, marginLeft: 6 }}>
                      ({totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%)
                    </span>
                  </div>
                  {solPriceUsd > 0 && (
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: totalPnlColor, opacity: 0.7 }}>
                      {totalPnlSol >= 0 ? "+" : ""}{formatUsd(solToUsd(totalPnlSol, solPriceUsd))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Positions list */}
        <AnimatePresence>
          {positions
            .sort((a, b) => (b.value_sol || 0) - (a.value_sol || 0))
            .map((pos, i) => {
              const color = TOKEN_COLORS[pos.token_color] || TOKEN_COLORS.blue;
              const tokens = pos.balance / 1e6;
              const investedSol = pos.sol_invested / 1e9;
              const pnlSol = pos.pnl_sol ?? 0;
              const pnlPct = pos.pnl_pct ?? 0;
              const pnlColor = pnlSol >= 0 ? "#22c55e" : "#ef4444";
              const avgEntry = pos.tokens_bought > 0
                ? (pos.sol_invested / pos.tokens_bought) * 1e6 / 1e9
                : 0;

              return (
                <motion.div
                  key={pos.mint_address}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={`/person/${pos.mint_address}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div
                      style={{
                        background: "var(--card-bg)",
                        border: "1px solid var(--border-light)",
                        borderLeft: `4px solid ${color}`,
                        borderRadius: 8,
                        padding: "16px 20px",
                        marginBottom: 12,
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto",
                        gap: 16,
                        alignItems: "center",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = "translateX(2px)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-light)"; e.currentTarget.style.borderLeftColor = color; e.currentTarget.style.transform = ""; }}
                    >
                      {/* Avatar */}
                      <div style={{ width: 52, height: 52, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `2px solid ${color}` }}>
                        <Image
                          src={pos.avatar_url || "/default-avatar.png"}
                          alt={pos.display_name}
                          width={52}
                          height={52}
                          style={{ objectFit: "cover" }}
                        />
                      </div>

                      {/* Info */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <span style={{ fontWeight: 900, fontSize: "0.95rem" }}>{pos.display_name}</span>
                          <span style={{
                            fontSize: "0.65rem", fontWeight: 800,
                            color, border: `1px solid ${color}`,
                            padding: "1px 6px", borderRadius: 2,
                            textTransform: "uppercase", letterSpacing: "0.04em",
                          }}>
                            {pos.category}
                          </span>
                        </div>

                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600, display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <span>
                            <Coin size={13} weight="bold" style={{ verticalAlign: "middle", marginRight: 3 }} />
                            {formatTokens(tokens)} tokens
                          </span>
                          <span>
                            <Lightning size={13} weight="bold" style={{ verticalAlign: "middle", marginRight: 3 }} />
                            Entry: {formatSol(avgEntry)} SOL
                          </span>
                          {pos.current_price !== undefined && (
                            <span style={{ color: (pos.current_price || 0) > avgEntry ? "#22c55e" : avgEntry > 0 ? "#ef4444" : "var(--text-muted)" }}>
                              Now: {formatSol(pos.current_price)} SOL
                              {(pos.current_price || 0) > avgEntry ? " ↑" : avgEntry > 0 ? " ↓" : ""}
                            </span>
                          )}
                          <span style={{ opacity: 0.6 }}>{timeAgo(pos.first_bought_at)}</span>
                        </div>
                      </div>

                      {/* Value + P&L */}
                      <div style={{ textAlign: "right", minWidth: 130 }}>
                        <div style={{ fontSize: "1rem", fontWeight: 900 }}>
                          {pos.value_sol !== undefined ? `${formatSol(pos.value_sol)} SOL` : "..."}
                        </div>
                        {solPriceUsd > 0 && pos.value_sol !== undefined && (
                          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>
                            ~{formatUsd(solToUsd(pos.value_sol, solPriceUsd))}
                          </div>
                        )}
                        <div style={{
                          marginTop: 4, fontSize: "0.8rem", fontWeight: 900, color: pnlColor,
                          display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4,
                        }}>
                          {pnlSol >= 0 ? <TrendUp size={14} weight="bold" /> : <TrendDown size={14} weight="bold" />}
                          {pnlSol >= 0 ? "+" : ""}{formatSol(pnlSol)}
                          <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>
                            ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
        </AnimatePresence>

        {/* Summary footer */}
        <div style={{
          marginTop: 24, padding: "12px 16px",
          background: "var(--card-bg)", border: "1px solid var(--border-light)",
          borderRadius: 8, display: "flex", justifyContent: "space-between",
          fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)",
        }}>
          <span>
            <ChartLineUp size={14} weight="bold" style={{ verticalAlign: "middle", marginRight: 4 }} />
            Total invested: {formatSol(totalInvestedSol)} SOL
            {solPriceUsd > 0 && ` (~${formatUsd(solToUsd(totalInvestedSol, solPriceUsd))})`}
          </span>
          <span>
            <ArrowRight size={14} weight="bold" style={{ verticalAlign: "middle", marginRight: 4 }} />
            {positions.reduce((s, p) => s + p.buy_count, 0)} buys · {positions.reduce((s, p) => s + p.sell_count, 0)} sells
          </span>
        </div>
      </main>

      <Footer />
    </>
  );
}

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
  ArrowRight, Heartbeat, Coin, Lightning, Crown,
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
  const [holderRanks, setHolderRanks] = useState<Record<string, { rank: number; is_early_believer: boolean; total: number }>>({});

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

  // ── 3. Fetch holder ranks for all positions ──
  useEffect(() => {
    if (!walletAddress || positions.length === 0) return;
    const fetchRanks = async () => {
      const ranks: Record<string, { rank: number; is_early_believer: boolean; total: number }> = {};
      await Promise.all(
        positions.map(async (pos) => {
          try {
            const res = await fetch(`/api/holders/${pos.mint_address}?limit=1&wallet=${walletAddress}`);
            if (res.ok) {
              const data = await res.json();
              if (data.myRank) {
                ranks[pos.mint_address] = {
                  rank: data.myRank.rank,
                  is_early_believer: data.myRank.is_early_believer,
                  total: data.totalHolders || 0,
                };
              }
            }
          } catch { /* ignore */ }
        })
      );
      setHolderRanks(ranks);
    };
    fetchRanks();
  }, [walletAddress, positions.length]);

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
  const sortedPositions = [...positions].sort((a, b) => (b.value_sol || 0) - (a.value_sol || 0));
  const winningTrades = positions.filter(p => (p.pnl_sol || 0) > 0).length;
  const losingTrades = positions.filter(p => (p.pnl_sol || 0) < 0).length;
  const winRate = positions.length > 0 ? (winningTrades / positions.length) * 100 : 0;
  const totalTradesCount = positions.reduce((s, p) => s + p.buy_count + p.sell_count, 0);

  return (
    <>
      <div className="halftone-bg" />
      <Topbar />

      <main className="page" style={{ display: "flex", flexDirection: "column", maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
        
        <div className="port-header">
          <div>
            <h1 className="page__title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Heartbeat size={32} weight="bold" /> My Humano
            </h1>
            <div style={{ color: "var(--text-muted)", fontWeight: 700, fontSize: "0.85rem", marginTop: 4 }}>
              Terminal Portfolio Tracking
            </div>
          </div>
        </div>

        {/* ── 1. KPI Grid ── */}
        <div className="port-grid">
          <div className="port-kpi">
            <div className="port-kpi__title">Total Balance (Sell Value)</div>
            <div className="port-kpi__val">{formatSol(totalValueSol)} SOL</div>
            {solPriceUsd > 0 && <div className="port-kpi__sub">~{formatUsd(solToUsd(totalValueSol, solPriceUsd))}</div>}
          </div>
          <div className="port-kpi">
            <div className="port-kpi__title">Total Invested</div>
            <div className="port-kpi__val">{formatSol(totalInvestedSol)} SOL</div>
            {solPriceUsd > 0 && <div className="port-kpi__sub">~{formatUsd(solToUsd(totalInvestedSol, solPriceUsd))}</div>}
          </div>
          <div className="port-kpi">
            <div className="port-kpi__title">Net Profit (PnL)</div>
            <div className="port-kpi__val" style={{ color: totalPnlColor }}>
              {totalPnlSol >= 0 ? "+" : ""}{formatSol(totalPnlSol)} SOL
            </div>
            <div className="port-kpi__sub" style={{ color: totalPnlColor, opacity: 0.8 }}>
              {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%
            </div>
          </div>
          <div className="port-kpi">
            <div className="port-kpi__title">Win Rate & Activity</div>
            <div className="port-kpi__val">{winRate.toFixed(0)}%</div>
            <div className="port-kpi__sub">{winningTrades} W / {losingTrades} L · {totalTradesCount} Trades</div>
          </div>
        </div>

        {/* ── 2. Allocation Bar ── */}
        <div className="port-allocation">
          <div className="port-allocation__header">
            <span>Portfolio Allocation</span>
            <span>{positions.length} Assets</span>
          </div>
          <div className="port-allocation__bar">
            {sortedPositions.map((pos, i) => {
              const allocationStr = totalValueSol > 0 ? ((pos.value_sol || 0) / totalValueSol) * 100 : 0;
              if (allocationStr === 0) return null;
              const colorColors = Object.values(TOKEN_COLORS);
              const color = colorColors[i % colorColors.length];
              return (
                <div 
                  key={`alloc-${pos.mint_address}`}
                  className="port-allocation__segment"
                  style={{ width: `${allocationStr}%`, background: color }}
                  title={`${pos.display_name}: ${allocationStr.toFixed(1)}%`}
                />
              );
            })}
          </div>
          <div className="port-allocation__legend">
            {sortedPositions.slice(0, 8).map((pos, i) => {
              const allocationStr = totalValueSol > 0 ? ((pos.value_sol || 0) / totalValueSol) * 100 : 0;
              if (allocationStr < 1) return null;
              const colorColors = Object.values(TOKEN_COLORS);
              const color = colorColors[i % colorColors.length];
              return (
                <div key={`legend-${pos.mint_address}`} className="port-allocation__legend-item">
                  <div className="port-allocation__legend-color" style={{ background: color }} />
                  <span>{pos.display_name} ({allocationStr.toFixed(1)}%)</span>
                </div>
              );
            })}
            {sortedPositions.length > 8 && (
              <div className="port-allocation__legend-item">
                <div className="port-allocation__legend-color" style={{ background: "var(--border-light)" }} />
                <span>Others</span>
              </div>
            )}
          </div>
        </div>

        {/* ── 3. Data Table (Terminal Mode) ── */}
        <div className="term-table" style={{ border: "2px solid var(--border)", boxShadow: "8px 8px 0px rgba(0,0,0,0.1)", background: "var(--bg)" }}>
          {/* Header */}
          <div className="term-th" style={{ background: "var(--bg-panel)", borderBottom: "2px solid var(--border)", padding: "12px 16px" }}>
            <div className="term-cell term-cell--id">ASSET</div>
            <div className="term-cell term-cell--stats">BALANCE</div>
            <div className="term-cell term-cell--price">ENTRY PRICE</div>
            <div className="term-cell term-cell--price">CURRENT PRICE</div>
            <div className="term-cell term-cell--price">VALUE (SOL)</div>
            <div className="term-cell term-cell--change">PNL</div>
            <div className="term-cell" style={{ width: 80, justifyContent: "center" }}>ACTION</div>
          </div>

          {/* Body */}
          <div className="term-tbody">
            <AnimatePresence>
              {sortedPositions.map((pos, i) => {
                const colorColors = Object.values(TOKEN_COLORS);
                const color = colorColors[i % colorColors.length];
                const tokens = pos.balance / 1e6;
                const pnlSol = pos.pnl_sol ?? 0;
                const pnlPct = pos.pnl_pct ?? 0;
                const pnlColor = pnlSol >= 0 ? "var(--green)" : "var(--red)";
                const avgEntry = pos.tokens_bought > 0 ? (pos.sol_invested / pos.tokens_bought) * 1e6 / 1e9 : 0;
                const rank = holderRanks[pos.mint_address]?.rank;

                return (
                  <motion.div
                    key={pos.mint_address}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Link href={`/person/${pos.mint_address}`} className="screener-row" style={{ borderLeft: `4px solid ${color}` }}>
                      
                      {/* Asset & Avatar */}
                      <div className="term-cell term-cell--id screener-row__identity">
                        <div className="screener-row__avatar-wrap">
                          <Image src={pos.avatar_url || "/default-avatar.png"} alt={pos.display_name} width={32} height={32} className="screener-row__avatar" />
                        </div>
                        <div className="screener-row__identity-info">
                          <div className="screener-row__name-line">
                            <span className="screener-row__name">{pos.display_name}</span>
                            {rank && rank <= 3 && <span title={`Rank ${rank}`}><Crown size={14} weight="fill" color="var(--accent)" style={{ verticalAlign: "middle" }} /></span>}
                          </div>
                          <div className="screener-row__tag-line">
                            <span style={{ textTransform: "uppercase" }}>{pos.category}</span>
                          </div>
                        </div>
                      </div>

                      {/* Balance Tokens */}
                      <div className="term-cell term-cell--stats screener-row__stats">
                        <span className="screener-row__val">{formatTokens(tokens)}</span>
                        <span className="screener-row__subval">TOKENS</span>
                      </div>

                      {/* Entry Price */}
                      <div className="term-cell term-cell--price screener-row__price">
                        <div className="screener-row__price-col">
                          <span className="screener-row__val">{formatSol(avgEntry)}</span>
                        </div>
                      </div>

                      {/* Current Price */}
                      <div className="term-cell term-cell--price screener-row__price">
                        <div className="screener-row__price-col">
                          <span className="screener-row__val" style={{ color: (pos.current_price || 0) > avgEntry ? "var(--green)" : avgEntry > 0 ? "var(--red)" : "inherit" }}>
                            {pos.current_price !== undefined ? formatSol(pos.current_price) : "..."}
                          </span>
                        </div>
                      </div>

                      {/* Value (SOL) */}
                      <div className="term-cell term-cell--price screener-row__price">
                        <div className="screener-row__price-col">
                          <span className="screener-row__val">{pos.value_sol !== undefined ? formatSol(pos.value_sol) : "..."}</span>
                          {solPriceUsd > 0 && pos.value_sol !== undefined && (
                            <span className="screener-row__subval">~{formatUsd(solToUsd(pos.value_sol, solPriceUsd))}</span>
                          )}
                        </div>
                      </div>

                      {/* PNL */}
                      <div className="term-cell term-cell--change screener-row__change">
                        <div className="screener-row__price-col">
                          <span className="screener-row__val" style={{ color: pnlColor }}>
                            {pnlSol >= 0 ? "+" : ""}{formatSol(pnlSol)}
                          </span>
                          <span className="screener-row__subval" style={{ color: pnlColor }}>
                            {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* Action */}
                      <div className="term-cell" style={{ width: 80, justifyContent: "center" }}>
                        <button className="port-action-btn" onClick={(e) => { e.preventDefault(); window.location.href = `/person/${pos.mint_address}`; }}>TRADE</button>
                      </div>

                    </Link>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

      </main>

      <Footer />
    </>
  );
}

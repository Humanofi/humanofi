"use client";

import { createContext, useContext, useEffect, useState, use, useCallback, useRef } from "react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useHumanofi } from "@/hooks/useHumanofi";
import { useAuthFetch } from "@/lib/authFetch";
import { useBondingCurveWs, type LiveCurveData } from "@/hooks/useBondingCurveWs";
import { useSolPrice } from "@/hooks/useSolPrice";
import { estimateSell, formatUsd, solToUsd } from "@/lib/price";
import Flag from "@/components/Flag";
import type { BondingCurveChartHandle } from "@/components/BondingCurveChart";
import { PublicKey } from "@solana/web3.js";
import { getPersonById, Person } from "@/lib/mockData";
import {
  Heartbeat, TrendUp, TrendDown,
} from "@phosphor-icons/react";

// -- Token Color Palette --
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

// -- Types --
export interface CreatorData {
  mint_address: string;
  wallet_address: string;
  display_name: string;
  category: string;
  bio: string;
  story: string;
  offer: string;
  avatar_url: string | null;
  country_code: string | null;
  socials: Record<string, string>;
  activity_score: number;
  activity_status: string;
  regularity_score: number;
  engagement_score: number;
  retention_score: number;
  token_lock_until: string;
  subtitle: string;
  youtube_url: string;
  gallery_urls: string[];
  token_color: string;
  holder_count: number;
}

export interface BondingCurveData {
  x: { toNumber: () => number };
  y: { toNumber: () => number };
  k: { toString: () => string };
  supplyPublic: { toNumber: () => number };
  supplyCreator: { toNumber: () => number };
  supplyProtocol: { toNumber: () => number };
  solReserve: { toNumber: () => number };
  depthParameter: { toNumber: () => number };
  twapPrice: { toString: () => string };
  tradeCount: { toNumber: () => number };
  creator: { toString: () => string };
}

interface PersonContextType {
  creator: CreatorData | null;
  curveData: BondingCurveData | null;
  liveCurve: LiveCurveData | null;
  isHolder: boolean;
  isCreator: boolean;
  loading: boolean;
  mockPerson: Person | null;
  displayName: string;
  tokenColor: string;
  refreshCurve: () => Promise<void>;
  chartRef: React.RefObject<BondingCurveChartHandle | null>;
}

const PersonContext = createContext<PersonContextType>({
  creator: null,
  curveData: null,
  liveCurve: null,
  isHolder: false,
  isCreator: false,
  loading: true,
  mockPerson: null,
  displayName: "",
  tokenColor: "#1144ff",
  refreshCurve: async () => {},
  chartRef: { current: null },
});

export function usePerson() {
  return useContext(PersonContext);
}

export default function PersonLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const pathname = usePathname();
  
  const [creator, setCreator] = useState<CreatorData | null>(null);
  const [curveData, setCurveData] = useState<BondingCurveData | null>(null);
  const [isHolder, setIsHolder] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [loading, setLoading] = useState(true);

  const { authenticated } = usePrivy();
  const { fetchBondingCurve, connected, walletAddress } = useHumanofi();
  const authFetch = useAuthFetch();

  const mockPerson = getPersonById(id) || null;

  // ── Fetch creator data from Supabase ──
  const mintRef = useRef<string | null>(null);
  const chartRef = useRef<BondingCurveChartHandle | null>(null);

  const refreshCurve = useCallback(async () => {
    if (!mintRef.current) return;
    try {
      const curve = await fetchBondingCurve(new PublicKey(mintRef.current));
      if (curve) setCurveData(curve as unknown as BondingCurveData);
    } catch (err) {
      console.warn("Failed to refresh curve:", err);
    }
  }, [fetchBondingCurve]);

  useEffect(() => {
    async function fetchCreator() {
      setLoading(true);
      try {
        const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id);
        if (isSolanaAddress) {
          const res = await fetch(`/api/creators?mint=${id}`);
          if (res.ok) {
            const data = await res.json();
            const found = data.creators?.find((c: CreatorData) => c.mint_address === id);
            if (found) {
              setCreator(found);
              mintRef.current = found.mint_address;
              const curve = await fetchBondingCurve(new PublicKey(found.mint_address));
              if (curve) setCurveData(curve as unknown as BondingCurveData);
            }
          }
        }
      } catch (err) {
        console.warn("Failed to fetch creator:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCreator();
  }, [id, fetchBondingCurve]);

  // ── WebSocket: live bonding curve updates ──
  const [liveCurve, setLiveCurve] = useState<LiveCurveData | null>(null);
  
  const handleWsUpdate = useCallback((data: LiveCurveData) => {
    setLiveCurve(data);
    // Push live price to chart
    chartRef.current?.pushPrice(data.priceSol);
  }, []);

  useBondingCurveWs({
    mintAddress: mintRef.current,
    onUpdate: handleWsUpdate,
  });

  // ── Check if user is a holder / is the creator ──
  useEffect(() => {
    async function checkAccess() {
      if (!walletAddress || !creator?.mint_address) {
        setIsHolder(false);
        setIsCreator(false);
        return;
      }

      const userIsCreator = walletAddress === creator.wallet_address;
      setIsCreator(userIsCreator);

      if (userIsCreator) {
        setIsHolder(true);
        return;
      }

      try {
        const res = await authFetch(`/api/inner-circle/${creator.mint_address}/posts`);
        setIsHolder(res.ok);
      } catch {
        setIsHolder(false);
      }
    }

    if (authenticated && connected) {
      checkAccess();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, creator?.mint_address, authenticated, connected]);

  const isReal = !!creator;
  const person = mockPerson;

  // Token color
  const tokenColor = TOKEN_COLORS[creator?.token_color || "blue"] || TOKEN_COLORS.blue;

  // ── SOL price ──
  const { priceUsd: solPriceUsd } = useSolPrice();

  // ── Holder Position (My Position in header) ──
  interface HolderPosition {
    balance: number;
    sol_invested: number;
    sol_recovered: number;
    tokens_bought: number;
    buy_count: number;
    sell_count: number;
  }
  const [holderPosition, setHolderPosition] = useState<HolderPosition | null>(null);
  const [holderRank, setHolderRank] = useState<{ rank: number; is_early_believer: boolean; totalHolders: number } | null>(null);

  useEffect(() => {
    if (!walletAddress || !creator?.mint_address || isCreator) {
      setHolderPosition(null);
      setHolderRank(null);
      return;
    }
    fetch(`/api/portfolio?wallet=${walletAddress}&mint=${creator.mint_address}`)
      .then(r => r.json())
      .then(data => {
        if (data.positions?.length > 0) setHolderPosition(data.positions[0]);
      })
      .catch(() => {});

    // Fetch holder rank
    fetch(`/api/holders/${creator.mint_address}?limit=1&wallet=${walletAddress}`)
      .then(r => r.json())
      .then(data => {
        if (data.myRank) {
          setHolderRank({
            rank: data.myRank.rank,
            is_early_believer: data.myRank.is_early_believer,
            totalHolders: data.totalHolders || 0,
          });
        }
      })
      .catch(() => {});
  }, [walletAddress, creator?.mint_address, isCreator]);

  // Position calculations
  const rawX = curveData ? curveData.x.toNumber() : 0;
  const rawY = curveData ? curveData.y.toNumber() : 0;
  const rawK = curveData ? Number(curveData.k.toString()) : 0;
  const posTokensBase = holderPosition ? holderPosition.balance : 0;
  const posTokens = posTokensBase / 1e6;
  const posLiquidation = posTokensBase > 0 && rawX > 0 && rawY > 0 && rawK > 0
    ? estimateSell(rawX, rawY, rawK, posTokensBase)
    : null;
  const posValueSol = posLiquidation ? posLiquidation.solNet / 1e9 : 0;
  const posInvestedSol = holderPosition ? holderPosition.sol_invested / 1e9 : 0;
  const posRecoveredSol = holderPosition ? holderPosition.sol_recovered / 1e9 : 0;
  const posPnlSol = posValueSol + posRecoveredSol - posInvestedSol;
  const posPnlPct = posInvestedSol > 0 ? (posPnlSol / posInvestedSol) * 100 : 0;
  const posPnlColor = posPnlSol >= 0 ? "#22c55e" : "#ef4444";
  const posAvgEntry = holderPosition && holderPosition.tokens_bought > 0
    ? (holderPosition.sol_invested / holderPosition.tokens_bought) * 1e6 / 1e9
    : 0;

  // ── Loading state ──
  if (loading && !person) {
    return (
      <>
        <Topbar />
        <main className="page" style={{ textAlign: "center", paddingTop: 120 }}>
          <div style={{ fontSize: "1.2rem", fontWeight: 800 }}>Loading...</div>
        </main>
        <Footer />
      </>
    );
  }

  // ── Not found ──
  if (!creator && !person) {
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

  // Build display values
  const displayName = creator?.display_name || person?.name || "Unknown";
  const avatarUrl = creator?.avatar_url || person?.photoUrl || "/default-avatar.png";
  const category = creator?.category || person?.tag || "";
  const countryCode = creator?.country_code || person?.country || "—";
  const socials = creator?.socials || person?.socials || {};
  const subtitle = creator?.subtitle || "";
  const activityScore = creator?.activity_score || person?.activityScore || 0;
  const activityStatus = creator?.activity_status || "moderate";

  // Human Curve™ price: prefer liveCurve (WebSocket), fallback to curveData
  const liveX = liveCurve ? liveCurve.x : curveData ? curveData.x.toNumber() : 0;
  const liveY = liveCurve ? liveCurve.y : curveData ? curveData.y.toNumber() : 0;
  const spotPriceLamports = liveY > 0 ? liveX / liveY : 0;
  const liveSupplyPublic = liveCurve ? liveCurve.supplyPublic / 1e6 : curveData ? curveData.supplyPublic.toNumber() / 1e6 : 0;
  const liveSupplyCreator = liveCurve ? liveCurve.supplyCreator / 1e6 : curveData ? curveData.supplyCreator.toNumber() / 1e6 : 0;
  const priceStr = (curveData || liveCurve)
    ? `${(spotPriceLamports / 1e9 * 1e6).toFixed(4)} SOL`
    : person?.price || "—";
  const marketCapStr = (curveData || liveCurve)
    ? `${((liveSupplyPublic + liveSupplyCreator) * (spotPriceLamports / 1e9 * 1e6)).toFixed(2)} SOL`
    : person?.marketCap || "—";

  // Determine active tab from pathname
  const isInnerCircle = pathname?.includes("/inner-circle");
  const isPublicPosts = pathname?.includes("/public-posts");
  const isDrops = pathname?.includes("/drops");
  const isManage = pathname?.includes("/manage");
  const isProfile = !isInnerCircle && !isPublicPosts && !isDrops && !isManage;

  // Score status config
  const scoreConfig = {
    thriving: { color: "#22c55e", label: "Thriving", icon: "▲" },
    active: { color: "#3b82f6", label: "Active", icon: "●" },
    moderate: { color: "#f59e0b", label: "Moderate", icon: "○" },
    low_activity: { color: "#ef4444", label: "Low", icon: "▽" },
    dormant: { color: "#6b7280", label: "Dormant", icon: "—" },
  }[activityStatus] || { color: "#f59e0b", label: "Moderate", icon: "○" };

  return (
    <PersonContext.Provider value={{ creator, curveData, liveCurve, isHolder, isCreator, loading, mockPerson: person, displayName, tokenColor, refreshCurve, chartRef }}>
      <div className="halftone-bg" />
      <Topbar />

      <main className="page" style={{ paddingTop: 40, maxWidth: 1200, ["--token-color" as string]: tokenColor }}>
        <p style={{ marginBottom: 32 }}>
          <Link href="/" style={{ fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase" }}>
            ← Back to Marketplace
          </Link>
        </p>

        {/* Demo badge for mock profiles */}
        {!isReal && (
          <div style={{
            background: "rgba(255, 200, 0, 0.15)",
            border: "1px solid rgba(255, 200, 0, 0.3)",
            borderRadius: 0,
            padding: "8px 16px",
            marginBottom: 24,
            fontSize: "0.8rem",
            fontWeight: 700,
            color: "#ffc800",
          }}>
            ⚠ Demo profile — This is sample data. Create your own token to see real data.
          </div>
        )}

        {/* PROFILE HEADER */}
        <div className="profile-header" style={{ borderLeft: `4px solid ${tokenColor}` }}>
          <div className="profile-header__avatar-wrap">
            <Image 
              src={avatarUrl} 
              alt={displayName} 
              width={160} 
              height={160} 
              className="profile-header__img" 
              priority 
            />
          </div>
          <div className="profile-header__info">
            <h1 className="profile-header__name">{displayName}</h1>
            {subtitle && (
              <div className="profile-header__subtitle">&ldquo;{subtitle}&rdquo;</div>
            )}
            <div className="profile-header__meta">
              <span className="profile-header__tag" style={{ borderColor: tokenColor, color: tokenColor }}>{category}</span>
              <span className="profile-header__country"><Flag code={countryCode} size={14} /></span>
            </div>
            
            <div className="profile-header__socials">
              {Object.entries(socials).map(([platform, handle]) => (
                <a key={platform} href={handle.startsWith("http") ? handle : `https://${handle}`} target="_blank" rel="noopener noreferrer" className="social-link" title={handle}>
                  {platform} ↗
                </a>
              ))}
            </div>
          </div>

          {/* Activity Score Card — right side of header */}
          <div className="profile-header__score-card" style={{ borderColor: scoreConfig.color }}>
            <svg viewBox="0 0 80 80" className="profile-header__score-svg">
              <circle cx="40" cy="40" r="32" stroke="var(--border-light)" strokeWidth="5" fill="none" />
              <circle cx="40" cy="40" r="32" stroke={scoreConfig.color} strokeWidth="5" fill="none"
                strokeDasharray={`${(activityScore / 100) * 201} 201`} strokeLinecap="round"
                transform="rotate(-90 40 40)" style={{ transition: "stroke-dasharray 0.8s ease" }}
              />
              <text x="40" y="37" textAnchor="middle" fontSize="18" fontWeight="900" fill="var(--text)">{activityScore}</text>
              <text x="40" y="50" textAnchor="middle" fontSize="7" fontWeight="700" fill={scoreConfig.color}>{scoreConfig.label}</text>
            </svg>
            <div className="profile-header__score-label">Activity</div>
          </div>

          {/* ── MY POSITION (holders only) ── */}
          {isHolder && !isCreator && holderPosition && posTokens > 0 && (
            <div className="position-banner" style={{ ["--pos-color" as string]: tokenColor }}>
              <div className="position-banner__block">
                <div className="position-banner__label">Tokens</div>
                <div className="position-banner__value">
                  {posTokens >= 1000 ? `${(posTokens / 1000).toFixed(1)}K` : posTokens.toFixed(0)}
                </div>
              </div>

              <div className="position-banner__block">
                <div className="position-banner__label">Market Value</div>
                <div className="position-banner__value">
                  {posValueSol >= 1 ? posValueSol.toFixed(3) : posValueSol >= 0.0001 ? posValueSol.toFixed(4) : posValueSol.toFixed(6)} SOL
                  {solPriceUsd > 0 && (
                    <span className="position-banner__usd">
                      ≈ {formatUsd(solToUsd(posValueSol, solPriceUsd))}
                    </span>
                  )}
                </div>
              </div>

              <div className="position-banner__block">
                <div className="position-banner__label">Avg Entry</div>
                <div className="position-banner__value">
                  {posAvgEntry >= 0.0001 ? posAvgEntry.toFixed(4) : posAvgEntry.toFixed(6)} SOL
                </div>
              </div>

              <div className="position-banner__block position-banner__block--pnl">
                <div className="position-banner__label">Profit / Loss</div>
                <div className="position-banner__pnl" style={{ color: posPnlColor }}>
                  <span className="position-banner__pnl-icon">
                    {posPnlSol >= 0 ? <TrendUp size={16} weight="bold" /> : <TrendDown size={16} weight="bold" />}
                  </span>
                  <span className="position-banner__pnl-pct">
                    {posPnlPct >= 0 ? "+" : ""}{posPnlPct.toFixed(1)}%
                  </span>
                </div>
                <div className="position-banner__sub" style={{ color: posPnlColor }}>
                  {posPnlSol >= 0 ? "+" : ""}{posPnlSol >= 0.001 ? posPnlSol.toFixed(4) : posPnlSol.toFixed(6)} SOL
                </div>
              </div>

              {/* Holder Rank & Early Believer Badge */}
              {holderRank && (
                <div className="position-banner__block">
                  <div className="position-banner__label">Your Rank</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className={`holder-rank ${holderRank.rank <= 3 ? 'holder-rank--top' : ''}`}>
                      {holderRank.rank <= 3 ? '👑' : '🏅'} Believer #{holderRank.rank}
                      <span style={{ opacity: 0.6, fontSize: "0.65rem" }}> / {holderRank.totalHolders}</span>
                    </span>
                    {holderRank.is_early_believer && (
                      <span className="early-badge">⭐ Early Believer</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SUB-NAVIGATION */}
        <div className="person-tabs">
          {isCreator ? (
            <>
              <Link
                href={`/person/${id}`}
                className={`person-tabs__link ${isProfile ? "person-tabs__link--active" : ""}`}
              >
                Dashboard
              </Link>
              <Link
                href={`/person/${id}/inner-circle`}
                className={`person-tabs__link ${isInnerCircle ? "person-tabs__link--active" : ""}`}
              >
                Publish Post
              </Link>
              {/* Drops — hidden for now, re-enable later
              <Link
                href={`/person/${id}/drops`}
                className={`person-tabs__link ${isDrops ? "person-tabs__link--active" : ""}`}
              >
                Drops
              </Link>
              */}
              <Link
                href={`/person/${id}/manage`}
                className={`person-tabs__link ${isManage ? "person-tabs__link--active" : ""}`}
              >
                Manage Profile
              </Link>
            </>
          ) : (
            <>
              <Link
                href={`/person/${id}`}
                className={`person-tabs__link ${isProfile ? "person-tabs__link--active" : ""}`}
              >
                Profile & Trade
              </Link>
              {isReal && (
                <Link
                  href={`/person/${id}/public-posts`}
                  className={`person-tabs__link ${isPublicPosts ? "person-tabs__link--active" : ""}`}
                >
                  Public Posts
                </Link>
              )}
              {isReal && (
                <Link
                  href={`/person/${id}/inner-circle`}
                  className={`person-tabs__link ${isInnerCircle ? "person-tabs__link--active" : ""}`}
                >
                  Inner Circle
                  {!isHolder && <span style={{ fontSize: "0.7rem", opacity: 0.5, marginLeft: 4 }}>&#x25CB;</span>}
                </Link>
              )}
              {/* Drops — hidden for now, re-enable later
              {isReal && (
                <Link
                  href={`/person/${id}/drops`}
                  className={`person-tabs__link ${isDrops ? "person-tabs__link--active" : ""}`}
                >
                  Drops
                </Link>
              )}
              */}
            </>
          )}
        </div>

        {/* PAGE CONTENT */}
        {children}

      </main>
      <Footer />
    </PersonContext.Provider>
  );
}

"use client";

import { createContext, useContext, useEffect, useState, use } from "react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useHumanofi } from "@/hooks/useHumanofi";
import { PublicKey } from "@solana/web3.js";
import { getPersonById, Person } from "@/lib/mockData";

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
}

export interface BondingCurveData {
  basePrice: { toNumber: () => number };
  supplySold: { toNumber: () => number };
  solReserve: { toNumber: () => number };
  slope: { toNumber: () => number };
}

interface PersonContextType {
  creator: CreatorData | null;
  curveData: BondingCurveData | null;
  isHolder: boolean;
  isCreator: boolean;
  loading: boolean;
  mockPerson: Person | null;
  displayName: string;
  tokenColor: string;
}

const PersonContext = createContext<PersonContextType>({
  creator: null,
  curveData: null,
  isHolder: false,
  isCreator: false,
  loading: true,
  mockPerson: null,
  displayName: "",
  tokenColor: "#1144ff",
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

  const mockPerson = getPersonById(id) || null;

  // ── Fetch creator data from Supabase ──
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
        const res = await fetch(`/api/inner-circle/${creator.mint_address}/posts`, {
          headers: { "x-wallet-address": walletAddress },
        });
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

  const priceStr = curveData
    ? `${(curveData.basePrice.toNumber() / 1e9).toFixed(4)} SOL`
    : person?.price || "—";
  const marketCapStr = curveData
    ? `${((curveData.supplySold.toNumber() / 1e6) * (curveData.basePrice.toNumber() / 1e9)).toFixed(2)} SOL`
    : person?.marketCap || "—";

  // Determine active tab from pathname
  const isInnerCircle = pathname?.includes("/inner-circle");
  const isPublicPosts = pathname?.includes("/public-posts");
  const isManage = pathname?.includes("/manage");
  const isProfile = !isInnerCircle && !isPublicPosts && !isManage;

  // Score status config
  const scoreConfig = {
    thriving: { color: "#22c55e", label: "Thriving", icon: "🔥" },
    active: { color: "#3b82f6", label: "Active", icon: "⚡" },
    moderate: { color: "#f59e0b", label: "Moderate", icon: "○" },
    low_activity: { color: "#ef4444", label: "Low", icon: "▽" },
    dormant: { color: "#6b7280", label: "Dormant", icon: "💤" },
  }[activityStatus] || { color: "#f59e0b", label: "Moderate", icon: "○" };

  return (
    <PersonContext.Provider value={{ creator, curveData, isHolder, isCreator, loading, mockPerson: person, displayName, tokenColor }}>
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
              <span className="profile-header__country">{countryCode}</span>
              {isReal && (
                <>
                  <span className="profile-header__price">{priceStr}</span>
                  <span className="profile-header__mcap">MCap: {marketCapStr}</span>
                </>
              )}
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
                Inner Circle
              </Link>
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
                  {!isHolder && <span style={{ fontSize: "0.7rem", opacity: 0.5, marginLeft: 4 }}>🔒</span>}
                </Link>
              )}
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

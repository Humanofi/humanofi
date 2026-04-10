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
  token_lock_until: string;
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
  /** Convenience: the person's display name (from real or mock) */
  displayName: string;
}

const PersonContext = createContext<PersonContextType>({
  creator: null,
  curveData: null,
  isHolder: false,
  isCreator: false,
  loading: true,
  mockPerson: null,
  displayName: "",
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

  // Fallback to mock data if this ID is a mock slug
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

      // Creator check (local comparison, no API call)
      const userIsCreator = walletAddress === creator.wallet_address;
      setIsCreator(userIsCreator);

      // If the user IS the creator, they automatically have access
      if (userIsCreator) {
        setIsHolder(true);
        return;
      }

      // Check holder status via the Inner Circle API (validates on-chain)
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

  // Is this a real on-chain creator or a demo mock?
  const isReal = !!creator;
  const person = mockPerson;

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

  // Build display values from real or mock data
  const displayName = creator?.display_name || person?.name || "Unknown";
  const avatarUrl = creator?.avatar_url || person?.photoUrl || "/default-avatar.png";
  const category = creator?.category || person?.tag || "";
  const countryCode = creator?.country_code || person?.country || "—";
  const socials = creator?.socials || person?.socials || {};

  const priceStr = curveData
    ? `${(curveData.basePrice.toNumber() / 1e9).toFixed(4)} SOL`
    : person?.price || "—";
  const marketCapStr = curveData
    ? `${((curveData.supplySold.toNumber() / 1e6) * (curveData.basePrice.toNumber() / 1e9)).toFixed(2)} SOL`
    : person?.marketCap || "—";

  // Determine active tab from pathname
  const isInnerCircle = pathname?.includes("/inner-circle");
  const isManage = pathname?.includes("/manage");
  const isPublic = !isInnerCircle && !isManage;

  return (
    <PersonContext.Provider value={{ creator, curveData, isHolder, isCreator, loading, mockPerson: person, displayName }}>
      <div className="halftone-bg" />
      <Topbar />

      <main className="page" style={{ paddingTop: 40, maxWidth: 1200 }}>
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
            borderRadius: 8,
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
        <div className="profile-header">
          <Image 
            src={avatarUrl} 
            alt={displayName} 
            width={160} 
            height={160} 
            className="profile-header__img" 
            priority 
          />
          <div className="profile-header__info">
            <h1 className="profile-header__name">{displayName}</h1>
            <div className="profile-header__meta">
              <span className="profile-header__tag">{category}</span>
              <span className="profile-header__country">Country: {countryCode}</span>
              {isReal && (
                <>
                  <span className="profile-header__price">Price: {priceStr}</span>
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
        </div>

        {/* SUB-NAVIGATION */}
        <div className="person-tabs">
          {isCreator ? (
            <>
              <Link
                href={`/person/${id}`}
                className={`person-tabs__link ${isPublic ? "person-tabs__link--active" : ""}`}
              >
                Dashboard
              </Link>
              <Link
                href={`/person/${id}/inner-circle`}
                className={`person-tabs__link ${isInnerCircle ? "person-tabs__link--active" : ""}`}
              >
                Inner Circle
              </Link>
            </>
          ) : (
            <>
              <Link
                href={`/person/${id}`}
                className={`person-tabs__link ${isPublic ? "person-tabs__link--active" : ""}`}
              >
                Profile & Trade
              </Link>
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

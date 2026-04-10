"use client";

import { use, useState, useCallback, useEffect } from "react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import { getPersonById, Person } from "@/lib/mockData";
import BondingCurveChart from "@/components/BondingCurveChart";
import Link from "next/link";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { useHumanofi } from "@/hooks/useHumanofi";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";

// Treasury wallet (protocol fee receiver)
const TREASURY = new PublicKey(
  process.env.NEXT_PUBLIC_TREASURY_WALLET || "11111111111111111111111111111111"
);

// ─── Types ───
interface CreatorData {
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

interface BondingCurveData {
  basePrice: { toNumber: () => number };
  supplySold: { toNumber: () => number };
  solReserve: { toNumber: () => number };
  slope: { toNumber: () => number };
}

export default function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");

  // Data states
  const [creator, setCreator] = useState<CreatorData | null>(null);
  const [curveData, setCurveData] = useState<BondingCurveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<{ date: string; text: string }[]>([]);
  const [isHolder, setIsHolder] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");
  const [posting, setPosting] = useState(false);

  // Fallback to mock data if this ID is a mock slug
  const mockPerson = getPersonById(id) || null;

  // Auth & protocol
  const { authenticated, login } = usePrivy();
  const { buyTokens, sellTokens, fetchBondingCurve, connected, walletAddress } = useHumanofi();

  // ── Fetch creator data from Supabase ──
  useEffect(() => {
    async function fetchCreator() {
      setLoading(true);
      try {
        // Try to find by mint_address first (if id looks like a Solana address)
        const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id);
        
        if (isSolanaAddress) {
          const res = await fetch(`/api/creators?mint=${id}`);
          if (res.ok) {
            const data = await res.json();
            const found = data.creators?.find(
              (c: CreatorData) => c.mint_address === id
            );
            if (found) {
              setCreator(found);
              // Fetch on-chain bonding curve data
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

  // ── Check if user is a holder (for Inner Circle access) ──
  useEffect(() => {
    async function checkHolder() {
      if (!walletAddress || !creator?.mint_address) return;

      try {
        const res = await fetch(`/api/inner-circle/${creator.mint_address}/posts`, {
          headers: {
            "x-wallet-address": walletAddress,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setIsHolder(true);
          setIsCreator(data.isCreator || false);
          setPosts(
            (data.posts || []).map((p: { content: string; created_at: string }) => ({
              text: p.content,
              date: new Date(p.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
            }))
          );
        } else {
          setIsHolder(false);
          // Check if user is creator even if no posts
          setIsCreator(walletAddress === creator.wallet_address);
        }
      } catch {
        setIsHolder(false);
      }
    }

    if (authenticated && connected) {
      checkHolder();
    }
  }, [walletAddress, creator, authenticated, connected]);

  // ── Build display data (real or mock) ──
  const person: Person | null = creator
    ? {
        id: creator.mint_address,
        name: creator.display_name,
        tag: creator.category,
        price: curveData
          ? `${(curveData.basePrice.toNumber() / 1e9).toFixed(4)} SOL`
          : "—",
        priceNum: curveData ? curveData.basePrice.toNumber() / 1e9 : 0,
        change: 0, // TODO: calculate from history
        holders: 0, // TODO: from token_holders count
        marketCap: curveData
          ? `${((curveData.supplySold.toNumber() / 1e6) * (curveData.basePrice.toNumber() / 1e9)).toFixed(2)} SOL`
          : "—",
        photoUrl: creator.avatar_url || "/default-avatar.png",
        sparkline: Array.from({ length: 12 }, () => Math.floor(Math.random() * 18) + 3),
        bio: creator.bio,
        story: creator.story,
        offer: creator.offer,
        apy: 0,
        country: creator.country_code || "—",
        socials: creator.socials || {},
        activityScore: creator.activity_score || 0,
        vestingYear: 1,
        totalUnlocked: 0,
        createdAt: creator.token_lock_until,
      }
    : mockPerson;

  // ── Trade handler ──
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

    // Get the real mint address
    const mintAddress = creator?.mint_address;
    if (!mintAddress) {
      toast.error("This is a demo profile — trading not available.");
      return;
    }

    const creatorWallet = creator?.wallet_address;
    if (!creatorWallet) {
      toast.error("Creator wallet not found.");
      return;
    }

    try {
      if (activeTab === "buy") {
        await buyTokens({
          mint: new PublicKey(mintAddress),
          solAmount: parsedAmount,
          creatorWallet: new PublicKey(creatorWallet),
          treasury: TREASURY,
        });
      } else {
        await sellTokens({
          mint: new PublicKey(mintAddress),
          tokenAmount: parsedAmount * 1_000_000, // 6 decimals
          creatorWallet: new PublicKey(creatorWallet),
          treasury: TREASURY,
        });
      }
      setAmount("");
    } catch {
      // Error already handled by toast in useHumanofi
    }
  }, [authenticated, login, amount, person, creator, activeTab, buyTokens, sellTokens]);

  // ── Loading state ──
  if (loading && !mockPerson) {
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

  const isRealCreator = !!creator;

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

        {/* Demo badge for mock profiles */}
        {!isRealCreator && (
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
          <Image src={person.photoUrl} alt={person.name} width={160} height={160} className="profile-header__img" priority />
          <div className="profile-header__info">
            <h1 className="profile-header__name">{person.name}</h1>
            <div className="profile-header__meta">
              <span className="profile-header__tag">{person.tag}</span>
              <span className="profile-header__country">Country: {person.country}</span>
            </div>
            
            <div className="profile-header__socials">
              {Object.entries(person.socials || {}).map(([platform, handle]) => (
                <a key={platform} href={handle.startsWith("http") ? handle : `https://${handle}`} target="_blank" rel="noopener noreferrer" className="social-link" title={handle}>
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
                <div className="feed__count">{posts.length} POSTS</div>
              </div>

              {/* Creator post form */}
              {isCreator && creator && (
                <div style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 20,
                }}>
                  <textarea
                    value={newPostContent}
                    onChange={(e) => setNewPostContent(e.target.value)}
                    placeholder="Share something with your Inner Circle..."
                    style={{
                      width: "100%",
                      minHeight: 80,
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      color: "var(--text)",
                      padding: 12,
                      fontSize: "0.9rem",
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                  <button
                    className="btn-solid"
                    disabled={posting || !newPostContent.trim()}
                    onClick={async () => {
                      if (!newPostContent.trim() || !creator) return;
                      setPosting(true);
                      try {
                        const res = await fetch(`/api/inner-circle/${creator.mint_address}/posts`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "x-wallet-address": walletAddress || "",
                          },
                          body: JSON.stringify({ content: newPostContent }),
                        });
                        if (res.ok) {
                          toast.success("Post published!");
                          setNewPostContent("");
                          // Add the new post to the top
                          setPosts(prev => [{
                            text: newPostContent,
                            date: new Date().toLocaleDateString("en-US", {
                              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                            }),
                          }, ...prev]);
                        } else {
                          const data = await res.json();
                          toast.error(data.error || "Failed to post");
                        }
                      } catch {
                        toast.error("Failed to post");
                      } finally {
                        setPosting(false);
                      }
                    }}
                    style={{ marginTop: 12, fontSize: "0.8rem" }}
                  >
                    {posting ? "Publishing..." : "Publish to Inner Circle"}
                  </button>
                </div>
              )}

              {isHolder && posts.length > 0 ? (
                posts.map((post, i) => (
                  <div key={i} className="feed__post">
                    <div className="feed__post-date">{post.date}</div>
                    <div className="feed__post-text">{post.text}</div>
                  </div>
                ))
              ) : isHolder && posts.length === 0 ? (
                <div className="feed__locked">
                  <div className="feed__locked-icon">✨</div>
                  <div className="feed__locked-text">No posts yet</div>
                  <div className="feed__locked-sub">
                    {isCreator ? "Start sharing with your holders!" : `${person.name.split(" ")[0]} hasn't posted yet.`}
                  </div>
                </div>
              ) : (
                <div className="feed__locked">
                  <div className="feed__locked-icon">◈</div>
                  <div className="feed__locked-text">Inner Circle Locked</div>
                  <div className="feed__locked-sub">
                    {authenticated
                      ? `You must hold ${person.name.split(" ")[0]}'s tokens to view this content.`
                      : "Connect your wallet and hold tokens to access."}
                  </div>
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
                <div className="stat-card__lbl">Activity Score</div>
                <div className="stat-card__val">{person.activityScore}/100</div>
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
                <div style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase" }}>
                  {isRealCreator ? "Trade" : "Demo Mode"}
                </div>
                <div style={{ marginLeft: "auto", fontWeight: 800 }}>
                  {isRealCreator ? `${person.activityScore}/100` : "—"}
                </div>
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
                style={{ 
                  width: "100%", 
                  background: activeTab === "buy" ? "var(--accent)" : "var(--down, #e53e3e)",
                  opacity: isRealCreator ? 1 : 0.5,
                }}
                onClick={handleTrade}
                disabled={!isRealCreator}
              >
                {!authenticated
                  ? "Connect Wallet"
                  : !isRealCreator
                  ? "Demo — Create a Token First"
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

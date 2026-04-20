// ========================================
// Humanofi — Unified Feed Homepage
// ========================================
// THE central page. One smart feed that merges:
//   - Public posts (from creators)
//   - Inner Circle posts (if user holds tokens → "My Humano")
//   - Market signals (trades, whales, milestones, new creators)
// Smart algo: score-based ranking with diversity interleaving.
// Infinite scroll with IntersectionObserver.

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import LiveTradeTicker from "@/components/LiveTradeTicker";
import FeedSidebar from "@/components/FeedSidebar";
import PublicPostCard, { PublicPost } from "@/components/public-feed/PublicPostCard";
import PostCard, { PostData } from "@/components/inner-circle/PostCard";
import FeedEventCard, { FeedEventData } from "@/components/FeedEventCard";
import NewCreatorCard from "@/components/NewCreatorCard";
import TradeSignalGroup from "@/components/TradeSignalGroup";
import { useHumanofi } from "@/hooks/useHumanofi";
import { useAuthFetch } from "@/lib/authFetch";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import Image from "next/image";
import { ChartLineUp, Wallet, Lightning, Rocket, Shield, Users, Trophy, X, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import MarketPulse from "@/components/MarketPulse";

// ── Feed item types ──
type FeedItem =
  | { type: "public_post"; id: string; data: PublicPost; score: number }
  | { type: "circle_post"; id: string; data: PostData & { creatorInfo: { display_name: string; avatar_url: string | null } }; score: number }
  | { type: "event"; id: string; data: FeedEventData; score: number }
  | { type: "trade_group"; id: string; data: FeedEventData[]; score: number };

// ── Smart Feed Algorithm ──
const ITEMS_PER_PAGE = 15;

function computeScore(
  createdAt: string,
  opts: {
    isHeld?: boolean;
    hotScore?: number;
    reactionCount?: number;
    eventSignificance?: number; // 0-1
  }
): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageHours = Math.max(0.1, ageMs / 3600000);

  // Time decay: newer = higher, gravity 1.3
  const timeScore = 1 / Math.pow(ageHours + 1, 1.3);

  // Relevance boost: if user holds the token → 3x
  const relevanceMultiplier = opts.isHeld ? 3.0 : 1.0;

  // Engagement: normalized reaction count or hot_score
  const engagement = Math.log2(1 + (opts.reactionCount || 0) + (opts.hotScore || 0) * 5);

  // Event significance: whales/milestones get 2x, trades get 0.3x
  const significance = opts.eventSignificance ?? 1.0;

  return (timeScore * 100 + engagement * 2) * relevanceMultiplier * significance;
}

// Helper: extract mint from any feed item for creator diversity
function getMint(item: FeedItem): string {
  switch (item.type) {
    case "public_post": return (item.data as PublicPost).creator_mint;
    case "circle_post": return (item.data as { creator_mint: string }).creator_mint;
    case "event": return (item.data as FeedEventData).mint_address;
    case "trade_group": return (item.data as FeedEventData[])[0]?.mint_address || "";
  }
}

function interleaveWithDiversity(items: FeedItem[]): FeedItem[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);

  const result: FeedItem[] = [];
  const deferred: FeedItem[] = [];

  for (const item of sorted) {
    const lastTwo = result.slice(-2);
    // Block if 2 consecutive same type OR same creator
    const sameType = lastTwo.length === 2 && lastTwo.every(i => i.type === item.type);
    const sameMint = result.length > 0 && getMint(result[result.length - 1]) === getMint(item);

    if (sameType || sameMint) {
      deferred.push(item);
    } else {
      result.push(item);
      // Try to inject deferred
      if (deferred.length > 0) {
        const idx = deferred.findIndex(d => {
          const lastItem = result[result.length - 1];
          return d.type !== lastItem.type && getMint(d) !== getMint(lastItem);
        });
        if (idx >= 0) {
          result.push(deferred.splice(idx, 1)[0]);
        }
      }
    }
  }

  result.push(...deferred);
  return result;
}

export default function HomeFeedPage() {
  const { walletAddress } = useHumanofi();
  const { user: humanofiUser } = useSupabaseAuth();
  const { authenticated, login } = usePrivy();
  const authFetch = useAuthFetch();

  // Welcome modal for first-time users
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  // Detect first connection
  useEffect(() => {
    if (authenticated && walletAddress) {
      const key = `humanofi_welcomed_${walletAddress}`;
      if (!localStorage.getItem(key)) {
        setShowWelcomeModal(true);
        localStorage.setItem(key, "true");
      }
    }
  }, [authenticated, walletAddress]);

  // All raw data
  const [publicPosts, setPublicPosts] = useState<PublicPost[]>([]);
  const [circlePosts, setCirclePosts] = useState<(PostData & { creatorInfo: { display_name: string; avatar_url: string | null } })[]>([]);
  const [feedEvents, setFeedEvents] = useState<FeedEventData[]>([]);

  // Loading states
  const [publicLoading, setPublicLoading] = useState(true);
  const [circleLoading, setCircleLoading] = useState(true);
  const [feedEventsLoading, setFeedEventsLoading] = useState(true);

  // Circle-specific state
  const [feedIsCreator, setFeedIsCreator] = useState(false);
  const [userVotes, setUserVotes] = useState<Record<string, number>>({});
  const [userRsvps, setUserRsvps] = useState<Record<string, string>>({});
  const [balanceByMint, setBalanceByMint] = useState<Record<string, number>>({});
  const [heldMints, setHeldMints] = useState<Set<string>>(new Set());

  // Infinite scroll
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // ── Fetch public posts ──
  const fetchPublicFeed = useCallback(async () => {
    try {
      setPublicLoading(true);
      const res = await authFetch("/api/public-posts?limit=50");
      if (res.ok) {
        const data = await res.json();
        setPublicPosts(data.posts || []);
      }
    } catch (err) {
      console.error("Public feed error:", err);
    } finally {
      setPublicLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch market events ──
  const fetchFeedEvents = useCallback(async () => {
    try {
      setFeedEventsLoading(true);
      const res = await fetch("/api/feed-events?limit=40");
      if (res.ok) {
        const data = await res.json();
        setFeedEvents(data.events || []);
      }
    } catch (err) {
      console.error("Feed events error:", err);
    } finally {
      setFeedEventsLoading(false);
    }
  }, []);

  // ── Fetch circle posts (auth required) ──
  const fetchCirclesFeed = useCallback(async () => {
    if (!walletAddress) { setCircleLoading(false); return; }
    try {
      setCircleLoading(true);
      const res = await authFetch("/api/feed");
      if (!res.ok) { setCircleLoading(false); return; }
      const data = await res.json();
      if (data.userVotes) setUserVotes(data.userVotes);
      if (data.userRsvps) setUserRsvps(data.userRsvps);
      if (data.balanceByMint) {
        setBalanceByMint(data.balanceByMint);
        setHeldMints(new Set(Object.keys(data.balanceByMint)));
      }
      if (data.isCreator !== undefined) setFeedIsCreator(data.isCreator);

      const fetched = (data.posts || []).map((p: Record<string, unknown>) => ({
        id: p.id, content: (p.content as string) || "", post_type: (p.post_type as string) || "text",
        metadata: p.metadata || {}, image_urls: p.image_urls || [], media_urls: p.media_urls || [],
        is_pinned: p.is_pinned || false, creator_mint: p.creator_mint,
        created_at: p.created_at, reactions: {}, userReactions: [], reply_count: 0,
        creatorInfo: (p.creator_tokens as Record<string, unknown>) || { display_name: "Unknown", avatar_url: null },
      }));

      // Fetch reactions
      const mintGroups: Record<string, string[]> = {};
      fetched.forEach((p: Record<string, unknown>) => {
        const mint = p.creator_mint as string;
        if (!mintGroups[mint]) mintGroups[mint] = [];
        mintGroups[mint].push(p.id as string);
      });
      await Promise.all(Object.entries(mintGroups).map(async ([mint, ids]) => {
        try {
          const rr = await authFetch(`/api/inner-circle/${mint}/reactions?postIds=${ids.join(",")}`);
          if (rr.ok) {
            const rd = await rr.json();
            fetched.forEach((p: Record<string, unknown>) => {
              if (ids.includes(p.id as string)) {
                p.reactions = rd.reactions?.[p.id as string] || {};
                p.userReactions = rd.userReactions?.[p.id as string] || [];
              }
            });
          }
        } catch { /* silent */ }
      }));

      setCirclePosts(fetched as typeof circlePosts);
    } catch (err) {
      console.error("Circles feed error:", err);
    } finally {
      setCircleLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  // ── Load on mount ──
  useEffect(() => {
    fetchPublicFeed();
    fetchFeedEvents();
  }, [fetchPublicFeed, fetchFeedEvents]);

  useEffect(() => {
    if (authenticated && walletAddress) fetchCirclesFeed();
    else setCircleLoading(false);
  }, [authenticated, walletAddress, fetchCirclesFeed]);

  // ── Infinite scroll observer ──
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount(prev => prev + ITEMS_PER_PAGE);
        }
      },
      { threshold: 0.1 }
    );
    const el = loadMoreRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [publicLoading, feedEventsLoading]);

  // ── Handlers ──
  const handlePublicReactionChange = useCallback(
    (postId: string, reactions: Record<string, number>, userReactions: string[]) => {
      setPublicPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, reactions, userReactions } : p)));
    }, []
  );
  const handlePublicDelete = useCallback((postId: string) => {
    setPublicPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);
  const handlePublicUpdate = useCallback((postId: string, updates: Partial<PublicPost>) => {
    setPublicPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...updates } : p)));
  }, []);
  const handleCircleReactionChange = useCallback(
    (postId: string, reactions: Record<string, number>, userReactions: string[]) => {
      setCirclePosts((prev) => prev.map((p) => (p.id === postId ? { ...p, reactions, userReactions } : p)));
    }, []
  );
  const handleVote = useCallback(async (postId: string, optionIndex: number) => {
    const post = circlePosts.find((p) => p.id === postId);
    if (!post) return;
    const res = await authFetch(`/api/inner-circle/${post.creator_mint}/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, optionIndex }),
    });
    if (res.ok) {
      setUserVotes((prev) => ({ ...prev, [postId]: optionIndex }));
      toast.success("Vote recorded!");
      fetchCirclesFeed();
    } else toast.error((await res.json()).error || "Failed to vote");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circlePosts]);
  const handleRsvp = useCallback(async (postId: string, status: string) => {
    const post = circlePosts.find((p) => p.id === postId);
    if (!post) return;
    const res = await authFetch(`/api/inner-circle/${post.creator_mint}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, status }),
    });
    if (res.ok) {
      setUserRsvps((prev) => ({ ...prev, [postId]: status }));
      toast.success(status === "going" ? "You're going!" : "Marked as interested");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circlePosts]);

  // ═══════════════════════════════════════
  // BUILD THE SMART FEED
  // ═══════════════════════════════════════
  const buildSmartFeed = (): FeedItem[] => {
    const items: FeedItem[] = [];
    const seenIds = new Set<string>();

    // 1. Public posts → scored
    publicPosts.forEach(post => {
      if (seenIds.has(post.id)) return;
      seenIds.add(post.id);

      const totalReactions = Object.values(post.reactions || {}).reduce((s, n) => s + (n as number), 0);
      const score = computeScore(post.created_at, {
        isHeld: heldMints.has(post.creator_mint),
        hotScore: (post as unknown as Record<string, unknown>).hot_score as number || 0,
        reactionCount: totalReactions,
      });

      items.push({ type: "public_post", id: `pub-${post.id}`, data: post, score });
    });

    // 2. Circle posts → boosted (skip posts already shown as public)
    circlePosts.forEach(post => {
      if (seenIds.has(post.id)) return;
      seenIds.add(post.id);

      // If this post was also published publicly, skip it here —
      // it will already appear as a public_post in the feed
      const meta = (post.metadata || {}) as Record<string, unknown>;
      if (meta.is_public) return;

      const totalReactions = Object.values(post.reactions || {}).reduce((s, n) => s + (n as number), 0);
      const score = computeScore(post.created_at, {
        isHeld: true, // Always held (that's why it's in circles)
        reactionCount: totalReactions,
      });

      items.push({ type: "circle_post", id: `circle-${post.id}`, data: post, score });
    });

    // 3. Market events — Filter noise:
    //    - Skip trade events < 0.05 SOL (noise)
    //    - Skip trades that already have a whale_alert (avoid duplication)
    const significantTypes = ["whale_alert", "milestone", "new_creator"];
    const tradeEvents: FeedEventData[] = [];
    const whaleAlertTxs = new Set<string>();

    // First pass: collect whale alert wallet+mint combos
    feedEvents.forEach(event => {
      if (event.event_type === "whale_alert") {
        whaleAlertTxs.add(`${event.wallet_address}:${event.mint_address}`);
      }
    });

    feedEvents.forEach(event => {
      if (seenIds.has(event.id)) return;
      seenIds.add(event.id);

      if (event.event_type === "trade") {
        const d = event.data || {};
        const solAmt = Number(d.sol_amount || 0);
        // Skip tiny trades (< 0.05 SOL = 50M lamports)
        if (solAmt < 50_000_000) return;
        // Skip if a whale_alert already covers this exact trade
        const key = `${event.wallet_address}:${event.mint_address}`;
        if (whaleAlertTxs.has(key)) return;

        tradeEvents.push(event);
      } else {
        const significance = significantTypes.includes(event.event_type)
          ? (event.event_type === "whale_alert" ? 3.0 : 2.0)
          : 0.4;

        const score = computeScore(event.created_at, {
          isHeld: heldMints.has(event.mint_address),
          eventSignificance: significance,
        });

        items.push({ type: "event", id: `evt-${event.id}`, data: event, score });
      }
    });

    // Group trades — max 2 groups total to avoid noise
    const maxGroups = 2;
    for (let i = 0; i < Math.min(tradeEvents.length, maxGroups * 3); i += 3) {
      const group = tradeEvents.slice(i, i + 3);
      const latestTime = Math.max(...group.map(t => new Date(t.created_at).getTime()));
      const avgScore = computeScore(new Date(latestTime).toISOString(), { eventSignificance: 0.4 });
      items.push({ type: "trade_group", id: `trades-${i}`, data: group, score: avgScore });
    }

    // Apply diversity interleaving
    return interleaveWithDiversity(items);
  };

  const allItems = buildSmartFeed();
  const visibleItems = allItems.slice(0, visibleCount);
  const hasMore = visibleCount < allItems.length;
  const isLoading = publicLoading && feedEventsLoading;

  return (
    <>
      <div className="halftone-bg" />
      <Topbar />

      {/* Live Trade Ticker — always on top */}
      <LiveTradeTicker />

      <main style={{ paddingBottom: 100 }}>
        {/* ═══════════════════════════════════
            HERO — Non-connected users
            ═══════════════════════════════════ */}
        {!authenticated && (
          <section className="hero">
            <div className="hero__inner">
              <div className="hero__content">
                <div className="hero__badge">⚡ THE HUMAN MARKET</div>
                <h1 className="hero__title">
                  Invest in <span className="hero__highlight">people</span>.<br/>
                  Not projects. Not memes. Real humans.
                </h1>
                <p className="hero__subtitle">
                  Humanofi is the first platform where you buy tokens representing real humans.
                  Every purchase is a public vote of confidence. Your portfolio is your identity.
                </p>
                <div className="hero__cta-row">
                  <button className="hero__cta-primary" onClick={login}>
                    <Wallet size={18} weight="bold" />
                    Connect Wallet
                  </button>
                  <Link href="/explore" className="hero__cta-secondary">
                    Explore Humans <ArrowRight size={14} weight="bold" />
                  </Link>
                </div>
                <div className="hero__stats">
                  <div className="hero__stat">
                    <Shield size={16} weight="fill" />
                    <span>Identity Verified</span>
                  </div>
                  <div className="hero__stat">
                    <Trophy size={16} weight="fill" />
                    <span>On-chain Proof</span>
                  </div>
                  <div className="hero__stat">
                    <Users size={16} weight="fill" />
                    <span>Inner Circles</span>
                  </div>
                </div>
              </div>
              <div className="hero__visual">
                <div className="hero__cards-stack">
                  {/* Card 1 (Back left) */}
                  <div className="hero__card hero__card--bg2">
                    <div className="hero__card-top">
                      <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80" alt="Mia R. — Developer token creator on Humanofi" />
                      <div>
                        <div className="hero__card-name">Mia R.</div>
                        <div className="hero__card-symbol">$MIA • Developer</div>
                      </div>
                    </div>
                    <div className="hero__card-stats">
                      <div>Volume <span>120 SOL</span></div>
                      <div>Holders <span>45</span></div>
                    </div>
                  </div>
                  
                  {/* Card 2 (Back right) */}
                  <div className="hero__card hero__card--bg1">
                    <div className="hero__card-top">
                      <img src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&q=80" alt="David K. — Founder token creator on Humanofi" />
                      <div>
                        <div className="hero__card-name">David K.</div>
                        <div className="hero__card-symbol">$DVK • Founder</div>
                      </div>
                    </div>
                    <div className="hero__card-stats">
                      <div>Volume <span>850 SOL</span></div>
                      <div>Holders <span>312</span></div>
                    </div>
                  </div>

                  {/* Card 3 (Main front) */}
                  <div className="hero__card hero__card--main">
                    <div className="hero__card-top">
                      <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80" alt="Sarah Chen — Designer token creator on Humanofi" />
                      <div>
                        <div className="hero__card-name">Sarah Chen</div>
                        <div className="hero__card-symbol">$CHEN • Designer</div>
                      </div>
                    </div>
                    <div className="hero__card-price">
                      <span>Live Price</span>
                      <strong>$1.42 <span>+12%</span></strong>
                    </div>
                    <div className="hero__card-btn">Invest in Sarah</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════
            WELCOME MODAL — First-time connection
            ═══════════════════════════════════ */}
        <AnimatePresence>
          {showWelcomeModal && (
            <motion.div
              className="welcome-modal__overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWelcomeModal(false)}
            >
              <motion.div
                className="welcome-modal"
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button className="welcome-modal__close" onClick={() => setShowWelcomeModal(false)}>
                  <X size={18} weight="bold" />
                </button>

                <div className="welcome-modal__header">
                  <div className="welcome-modal__icon">👋</div>
                  <h2>Welcome to Humanofi</h2>
                  <p>The first market where <strong>humans are the asset</strong>.</p>
                </div>

                <div className="welcome-modal__steps">
                  <div className="welcome-modal__step">
                    <div className="welcome-modal__step-num">1</div>
                    <div>
                      <strong>Discover humans</strong>
                      <p>Browse verified creators — entrepreneurs, artists, developers. Each has their own token.</p>
                    </div>
                  </div>
                  <div className="welcome-modal__step">
                    <div className="welcome-modal__step-num">2</div>
                    <div>
                      <strong>Back the ones you believe in</strong>
                      <p>Buy their token with SOL. Your purchase is a public vote of confidence — visible to everyone.</p>
                    </div>
                  </div>
                  <div className="welcome-modal__step">
                    <div className="welcome-modal__step-num">3</div>
                    <div>
                      <strong>Join their Inner Circle</strong>
                      <p>As a holder, unlock exclusive content, private updates, and direct access to the creator.</p>
                    </div>
                  </div>
                  <div className="welcome-modal__step">
                    <div className="welcome-modal__step-num">4</div>
                    <div>
                      <strong>Build your identity</strong>
                      <p>Your portfolio defines who you are. Selling is a public act. Every position tells a story.</p>
                    </div>
                  </div>
                </div>

                <button className="welcome-modal__go" onClick={() => setShowWelcomeModal(false)}>
                  <Rocket size={18} weight="fill" />
                  Let&apos;s go!
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Feed header */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 0" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            paddingBottom: 16, borderBottom: "3px solid var(--border)",
            marginBottom: 24
          }}>
            <Lightning size={22} weight="fill" color="var(--accent)" />
            <h1 style={{
              fontSize: "1.1rem", fontWeight: 900, textTransform: "uppercase",
              letterSpacing: "0.04em", margin: 0, color: "var(--text)"
            }}>
              Live Feed
            </h1>
            <span style={{
              fontSize: "0.65rem", fontWeight: 800, color: "var(--accent)",
              background: "var(--accent-bg)", padding: "2px 8px",
              textTransform: "uppercase", letterSpacing: "0.05em"
            }}>
              Smart
            </span>
          </div>
        </div>

        {/* Main feed layout */}
        {/* Market Pulse — live stats (sets market context) */}
        <div className="unified-feed">
          {/* LEFT: Feed stream */}
          <div className="unified-feed__main">
            <MarketPulse />
            {/* Feed content */}
            {isLoading ? (
              <div className="feed-loading">
                <div className="feed-loading__pulse" />
                <span>Loading your feed...</span>
              </div>
            ) : visibleItems.length === 0 ? (
              <div style={{ padding: "64px 24px", textAlign: "center", border: "2px dashed var(--border)" }}>
                <ChartLineUp size={32} style={{ margin: "0 auto", opacity: 0.5 }} />
                <h3 style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: 16 }}>Network is quiet</h3>
                <p style={{ color: "var(--text-muted)", fontWeight: 700, marginTop: 8 }}>No activity yet. Be the first!</p>
                <Link href="/explore" className="btn-solid" style={{ marginTop: 16, display: "inline-block" }}>
                  Explore Marketplace
                </Link>
              </div>
            ) : (
              <>
                <div className="feed-stream">
                  {visibleItems.map((item, idx) => {
                    switch (item.type) {
                      case "public_post": {
                        const post = item.data as PublicPost;
                        return (
                          <div key={item.id} className="feed-stream__item" style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}>
                            <PublicPostCard
                              post={post}
                              walletAddress={walletAddress || undefined}
                              isOwner={!!humanofiUser?.creator?.mint_address && humanofiUser.creator.mint_address === post.creator_mint}
                              onDelete={handlePublicDelete}
                              onUpdate={handlePublicUpdate}
                              onReactionChange={handlePublicReactionChange}
                            />
                          </div>
                        );
                      }
                      case "circle_post": {
                        const post = item.data as typeof circlePosts[number];
                        return (
                          <div key={item.id} className="feed-stream__item circle-post-wrapper" style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}>
                            <div className="circle-post-badge">🔒 My Humano</div>
                            <PostCard
                              post={post}
                              creatorName={post.creatorInfo.display_name}
                              creatorAvatar={post.creatorInfo.avatar_url || "/default-avatar.png"}
                              walletAddress={walletAddress || ""}
                              isCreator={feedIsCreator && post.creatorInfo.display_name !== "Unknown"}
                              holderBalance={balanceByMint[post.creator_mint] ?? 0}
                              onVote={handleVote}
                              onRsvp={handleRsvp}
                              onReactionChange={handleCircleReactionChange}
                              userVotes={userVotes}
                              userRsvps={userRsvps}
                            />
                          </div>
                        );
                      }
                      case "event": {
                        const evt = item.data as FeedEventData;
                        if (evt.event_type === "new_creator") {
                          return (
                            <div key={item.id} className="feed-stream__item" style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}>
                              <NewCreatorCard event={evt} />
                            </div>
                          );
                        }
                        return (
                          <div key={item.id} className="feed-stream__item" style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}>
                            <FeedEventCard event={evt} />
                          </div>
                        );
                      }
                      case "trade_group": {
                        return (
                          <div key={item.id} className="feed-stream__item" style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}>
                            <TradeSignalGroup trades={item.data as FeedEventData[]} />
                          </div>
                        );
                      }
                      default:
                        return null;
                    }
                  })}
                </div>

                {/* Infinite scroll sentinel */}
                {hasMore && (
                  <div ref={loadMoreRef} className="feed-load-more">
                    <div className="feed-loading__pulse" />
                    <span>Loading more...</span>
                  </div>
                )}

                {!hasMore && visibleItems.length > 5 && (
                  <div className="feed-end">
                    You&apos;re all caught up. Check back later for new activity.
                  </div>
                )}
              </>
            )}
          </div>

          {/* RIGHT: Sidebar */}
          <FeedSidebar walletAddress={walletAddress} authenticated={authenticated} />
        </div>
      </main>

      <Footer />
    </>
  );
}

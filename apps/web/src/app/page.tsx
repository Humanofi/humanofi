// ========================================
// Humanofi — Smart Feed V2 Homepage
// ========================================
// THE central page. Proprietary "Human Pulse" algorithm:
//   - Adaptive density: quiet/normal/high volume modes
//   - Smart trade grouping by creator + time window
//   - Score-based ranking with diversity interleaving
//   - Supabase Realtime (live events + toast notifications)
//   - Feed filters (Posts / My Humano / Market)
// Infinite scroll with IntersectionObserver.

"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
import { useRealtimeFeed } from "@/hooks/useRealtimeFeed";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import Image from "next/image";
import { ChartLineUp, Wallet, Lightning, Rocket, Shield, Users, Trophy, X, ArrowRight, Funnel, Note, Lock, Pulse, HandWaving } from "@phosphor-icons/react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import MarketPulse from "@/components/MarketPulse";

// ── Feed item types ──
type FeedItem =
  | { type: "public_post"; id: string; data: PublicPost; score: number }
  | { type: "circle_post"; id: string; data: PostData & { creatorInfo: { display_name: string; avatar_url: string | null } }; score: number }
  | { type: "event"; id: string; data: FeedEventData; score: number }
  | { type: "trade_group"; id: string; data: FeedEventData[]; score: number };

// ── Feed filter types ──
interface FeedFilters {
  posts: boolean;   // Public posts from creators
  circles: boolean; // Inner Circle posts (My Humano)
  market: boolean;  // Market events (trades, whales, milestones)
}

// ═══════════════════════════════════════
// HUMAN PULSE™ — Proprietary Feed Algorithm
// ═══════════════════════════════════════
// Adaptive density scoring invented for Humanofi.
// Core concept: the feed intelligence scales with network activity.

const ITEMS_PER_PAGE = 15;

// ── Density Modes ──
type DensityMode = "quiet" | "normal" | "high";

function detectDensityMode(events: FeedEventData[]): DensityMode {
  // Count events from the last hour
  const oneHourAgo = Date.now() - 3600000;
  const recentCount = events.filter(
    (e) => new Date(e.created_at).getTime() > oneHourAgo
  ).length;

  if (recentCount < 20) return "quiet";
  if (recentCount < 200) return "normal";
  return "high";
}

// ── Human Pulse Score™ ──
// Multi-signal scoring: time decay × engagement × significance × relevance × density
function computeHumanPulse(
  createdAt: string,
  density: DensityMode,
  opts: {
    isHeld?: boolean;
    hotScore?: number;
    reactionCount?: number;
    eventType?: string;
    solAmount?: number; // in lamports
  }
): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageHours = Math.max(0.1, ageMs / 3600000);

  // 1. Time decay — gravity 1.3 (newer = much higher)
  const timeScore = 1 / Math.pow(ageHours + 1, 1.3);

  // 2. Engagement signal — reactions and hot_score
  const engagement = Math.log2(1 + (opts.reactionCount || 0) + (opts.hotScore || 0) * 5);

  // 3. Significance — varies by event type
  let significance = 1.0;
  const solInSol = (opts.solAmount || 0) / 1e9;

  switch (opts.eventType) {
    case "whale_alert":
      significance = 4.0;
      break;
    case "milestone":
      significance = 3.5;
      break;
    case "new_creator":
      significance = 3.0;
      break;
    case "holder_exit":
      significance = 2.5;
      break;
    case "new_holder":
      significance = 1.5;
      break;
    case "trade":
      // Trade significance scales with SOL amount
      if (solInSol >= 1.0) significance = 1.2;
      else if (solInSol >= 0.5) significance = 0.8;
      else if (solInSol >= 0.1) significance = 0.4;
      else significance = 0.2;
      break;
    case "public_post":
      significance = 2.0;
      break;
    case "circle_post":
      significance = 2.5;
      break;
  }

  // 4. Relevance — user holds the token → strong boost
  const relevance = opts.isHeld ? 3.0 : 1.0;

  // 5. Density multiplier — adaptive filtering
  let densityMultiplier = 1.0;
  if (density === "normal") {
    // Normal mode: boost important signals, dampen noise
    if (opts.eventType === "trade" && solInSol < 0.05) densityMultiplier = 0; // Filter tiny trades
    else if (opts.eventType === "trade" && solInSol < 0.5) densityMultiplier = 0.3; // Dampen medium trades (will be grouped)
    else if (["whale_alert", "milestone", "new_creator", "holder_exit"].includes(opts.eventType || "")) densityMultiplier = 1.5;
  } else if (density === "high") {
    // High mode: only highlights pass
    if (opts.eventType === "trade" && solInSol < 0.1) densityMultiplier = 0; // Hard filter
    else if (opts.eventType === "trade" && solInSol < 0.5) densityMultiplier = 0.1; // Almost zero — grouped
    else if (opts.eventType === "new_holder") densityMultiplier = 0.2; // Dampen new_holder noise
  }
  // Quiet mode: densityMultiplier stays 1.0 — show everything

  const rawScore = (timeScore * 100 + engagement * 3 + significance * 5) * relevance * densityMultiplier;
  return rawScore;
}

// ── Smart Trade Grouping ──
// Groups trades by creator within a 30-minute window
function groupTradesByCreator(
  trades: FeedEventData[],
  density: DensityMode
): { grouped: FeedItem[]; ungrouped: FeedEventData[] } {
  const grouped: FeedItem[] = [];
  const ungrouped: FeedEventData[] = [];

  // Group by mint_address
  const byMint: Record<string, FeedEventData[]> = {};
  trades.forEach((t) => {
    if (!byMint[t.mint_address]) byMint[t.mint_address] = [];
    byMint[t.mint_address].push(t);
  });

  const minGroupSize = density === "high" ? 3 : density === "normal" ? 2 : 4;

  for (const [, mintTrades] of Object.entries(byMint)) {
    if (mintTrades.length >= minGroupSize) {
      // Group these trades
      const latestTime = Math.max(...mintTrades.map((t) => new Date(t.created_at).getTime()));
      const totalVol = mintTrades.reduce((s, t) => s + Number((t.data as Record<string, unknown>).sol_amount || 0), 0);
      const score = computeHumanPulse(new Date(latestTime).toISOString(), density, {
        eventType: "trade",
        solAmount: totalVol / mintTrades.length, // avg per trade
      });
      grouped.push({
        type: "trade_group",
        id: `tg-${mintTrades[0].mint_address}-${latestTime}`,
        data: mintTrades,
        score,
      });
    } else {
      // Not enough to group — keep individual
      ungrouped.push(...mintTrades);
    }
  }

  return { grouped, ungrouped };
}

// ── Diversity Interleaving ──
// Prevents monotonous feeds: max 2 consecutive same-type or same-creator
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
    const sameType = lastTwo.length === 2 && lastTwo.every((i) => i.type === item.type);
    const sameMint = result.length > 0 && getMint(result[result.length - 1]) === getMint(item);

    if (sameType || sameMint) {
      deferred.push(item);
    } else {
      result.push(item);
      // Try to inject deferred
      if (deferred.length > 0) {
        const idx = deferred.findIndex((d) => {
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

// ═══════════════════════════════════════
// WELCOME MODAL (extracted component)
// ═══════════════════════════════════════
function WelcomeModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      className="welcome-modal__overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="welcome-modal"
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 30 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="welcome-modal__close" onClick={onClose}>
          <X size={18} weight="bold" />
        </button>
        <div className="welcome-modal__header">
          <div className="welcome-modal__icon"><HandWaving size={32} weight="fill" color="var(--accent)" /></div>
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
        <button className="welcome-modal__go" onClick={onClose}>
          <Rocket size={18} weight="fill" />
          Let&apos;s go!
        </button>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════
// SKELETON LOADING
// ═══════════════════════════════════════
function FeedSkeleton() {
  return (
    <div className="feed-skeleton">
      {[1, 2, 3].map((i) => (
        <div key={i} className="feed-skeleton__card">
          <div className="feed-skeleton__header">
            <div className="feed-skeleton__avatar feed-skeleton__shimmer" />
            <div className="feed-skeleton__lines">
              <div className="feed-skeleton__line feed-skeleton__line--short feed-skeleton__shimmer" />
              <div className="feed-skeleton__line feed-skeleton__line--tiny feed-skeleton__shimmer" />
            </div>
          </div>
          <div className="feed-skeleton__body">
            <div className="feed-skeleton__line feed-skeleton__shimmer" />
            <div className="feed-skeleton__line feed-skeleton__line--medium feed-skeleton__shimmer" />
          </div>
          <div className="feed-skeleton__footer">
            <div className="feed-skeleton__pill feed-skeleton__shimmer" />
            <div className="feed-skeleton__pill feed-skeleton__shimmer" />
            <div className="feed-skeleton__pill feed-skeleton__shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════
export default function HomeFeedPage() {
  const { walletAddress } = useHumanofi();
  const { user: humanofiUser } = useSupabaseAuth();
  const { authenticated, login, ready } = usePrivy();
  const authFetch = useAuthFetch();
  const realtime = useRealtimeFeed();

  // Welcome modal
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  useEffect(() => {
    if (authenticated && walletAddress) {
      const key = `humanofi_welcomed_${walletAddress}`;
      if (!localStorage.getItem(key)) {
        setShowWelcomeModal(true);
        localStorage.setItem(key, "true");
      }
    }
  }, [authenticated, walletAddress]);

  // Feed filters
  const [feedFilters, setFeedFilters] = useState<FeedFilters>({
    posts: true,
    circles: true,
    market: true,
  });

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
      const headers: Record<string, string> = {};
      if (walletAddress) headers["x-wallet-address"] = walletAddress;
      const res = await fetch("/api/public-posts?limit=50", { headers });
      if (res.ok) {
        const data = await res.json();
        setPublicPosts(data.posts || []);
      }
    } catch (err) {
      console.error("Public feed error:", err);
    } finally {
      setPublicLoading(false);
    }
  }, [walletAddress]);

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
        created_at: p.created_at,
        reactions: p.reactions || {},
        userReactions: p.userReactions || [],
        reply_count: 0,
        creatorInfo: (p.creator_tokens as Record<string, unknown>) || { display_name: "Unknown", avatar_url: null },
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

  // ── Merge realtime events ──
  const handleMergeRealtime = useCallback(() => {
    const { events, posts } = realtime.flushPending();
    if (events.length > 0) {
      setFeedEvents(prev => [...events, ...prev]);
    }
    if (posts.length > 0) {
      setPublicPosts(prev => [...posts, ...prev]);
    }
  }, [realtime]);

  // Auto-merge after 30s
  useEffect(() => {
    if (realtime.pendingCount === 0) return;
    const timer = setTimeout(handleMergeRealtime, 30000);
    return () => clearTimeout(timer);
  }, [realtime.pendingCount, handleMergeRealtime]);


  // ── Infinite scroll observer ──
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => prev + ITEMS_PER_PAGE);
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
  // BUILD THE SMART FEED (Human Pulse™)
  // ═══════════════════════════════════════
  const allItems = useMemo(() => {
    const density = detectDensityMode(feedEvents);
    const items: FeedItem[] = [];
    const seenIds = new Set<string>();

    // 1. Public posts → scored (if filter active)
    if (feedFilters.posts) {
      publicPosts.forEach((post) => {
        if (seenIds.has(post.id)) return;
        seenIds.add(post.id);

        const totalReactions = Object.values(post.reactions || {}).reduce((s, n) => s + (n as number), 0);
        const score = computeHumanPulse(post.created_at, density, {
          isHeld: heldMints.has(post.creator_mint),
          hotScore: post.hot_score || 0,
          reactionCount: totalReactions,
          eventType: "public_post",
        });

        if (score > 0) {
          items.push({ type: "public_post", id: `pub-${post.id}`, data: post, score });
        }
      });
    }

    // 2. Circle posts → boosted (if filter active)
    if (feedFilters.circles) {
      circlePosts.forEach((post) => {
        if (seenIds.has(post.id)) return;
        seenIds.add(post.id);

        const meta = (post.metadata || {}) as Record<string, unknown>;
        if (meta.is_public) return; // Skip — already in public posts

        const totalReactions = Object.values(post.reactions || {}).reduce((s, n) => s + (n as number), 0);
        const score = computeHumanPulse(post.created_at, density, {
          isHeld: true,
          reactionCount: totalReactions,
          eventType: "circle_post",
        });

        if (score > 0) {
          items.push({ type: "circle_post", id: `circle-${post.id}`, data: post, score });
        }
      });
    }

    // 3. Market events (if filter active)
    if (feedFilters.market) {
      const significantTypes = ["whale_alert", "milestone", "new_creator", "holder_exit"];
      const tradeEvents: FeedEventData[] = [];
      const whaleAlertTxs = new Set<string>();

      // First pass: collect whale alert combos
      feedEvents.forEach((event) => {
        if (event.event_type === "whale_alert") {
          whaleAlertTxs.add(`${event.wallet_address}:${event.mint_address}`);
        }
      });

      feedEvents.forEach((event) => {
        if (seenIds.has(event.id)) return;
        seenIds.add(event.id);

        const d = event.data || {};
        const solAmount = Number((d as Record<string, unknown>).sol_amount || 0);

        if (event.event_type === "trade") {
          // Skip if whale_alert already covers this
          const key = `${event.wallet_address}:${event.mint_address}`;
          if (whaleAlertTxs.has(key)) return;

          // Score the trade — density filter may zero it out
          const tradeScore = computeHumanPulse(event.created_at, density, {
            isHeld: heldMints.has(event.mint_address),
            eventType: "trade",
            solAmount,
          });

          if (tradeScore > 0) {
            tradeEvents.push(event);
          }
        } else {
          const score = computeHumanPulse(event.created_at, density, {
            isHeld: heldMints.has(event.mint_address),
            eventType: event.event_type,
            solAmount,
          });

          if (score > 0 || significantTypes.includes(event.event_type)) {
            items.push({ type: "event", id: `evt-${event.id}`, data: event, score: Math.max(score, 0.1) });
          }
        }
      });

      // Smart trade grouping by creator
      const { grouped, ungrouped } = groupTradesByCreator(tradeEvents, density);
      items.push(...grouped);

      // Add ungrouped trades individually
      ungrouped.forEach((t) => {
        const d = t.data || {};
        const score = computeHumanPulse(t.created_at, density, {
          isHeld: heldMints.has(t.mint_address),
          eventType: "trade",
          solAmount: Number((d as Record<string, unknown>).sol_amount || 0),
        });
        items.push({ type: "event", id: `evt-${t.id}`, data: t, score });
      });
    }

    // Apply diversity interleaving
    return interleaveWithDiversity(items);
  }, [publicPosts, circlePosts, feedEvents, heldMints, feedFilters]);

  const visibleItems = allItems.slice(0, visibleCount);
  const hasMore = visibleCount < allItems.length;
  const isLoading = publicLoading && feedEventsLoading;

  // Filter counters
  const filterCounts = useMemo(() => ({
    posts: publicPosts.length,
    circles: circlePosts.length,
    market: feedEvents.length,
  }), [publicPosts, circlePosts, feedEvents]);

  return (
    <>
      <div className="halftone-bg" />
      <Topbar />

      {/* Live Trade Ticker */}
      <LiveTradeTicker latestRealtimeEvent={realtime.latestTickerEvent} />

      <main style={{ paddingBottom: 100 }}>
        {/* ═══════════════════════════════════
            HERO — Non-connected users
            ═══════════════════════════════════ */}
        {ready && !authenticated && (
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
          {showWelcomeModal && <WelcomeModal onClose={() => setShowWelcomeModal(false)} />}
        </AnimatePresence>

        {/* Feed header + filters */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 0" }}>
          <div className="feed-header">
            <div className="feed-header__left">
              <Lightning size={22} weight="fill" color="var(--accent)" />
              <h1 className="feed-header__title">Live Feed</h1>
              {realtime.isConnected && (
                <span className="feed-header__live-dot" title="Connected to realtime" />
              )}
            </div>

            {/* ── Feed Filters — Humanofi style ── */}
            <div className="feed-filters">
              <button
                className={`feed-filters__chip ${feedFilters.posts ? "feed-filters__chip--active" : ""}`}
                onClick={() => setFeedFilters(f => ({ ...f, posts: !f.posts }))}
              >
                <Note size={14} weight="bold" />
                <span>Posts</span>
                {filterCounts.posts > 0 && <span className="feed-filters__count">{filterCounts.posts}</span>}
              </button>
              {authenticated && (
                <button
                  className={`feed-filters__chip feed-filters__chip--circle ${feedFilters.circles ? "feed-filters__chip--active" : ""}`}
                  onClick={() => setFeedFilters(f => ({ ...f, circles: !f.circles }))}
                >
                  <Lock size={14} weight="bold" />
                  <span>My Humano</span>
                  {filterCounts.circles > 0 && <span className="feed-filters__count">{filterCounts.circles}</span>}
                </button>
              )}
              <button
                className={`feed-filters__chip ${feedFilters.market ? "feed-filters__chip--active" : ""}`}
                onClick={() => setFeedFilters(f => ({ ...f, market: !f.market }))}
              >
                <Pulse size={14} weight="bold" />
                <span>Market</span>
                {filterCounts.market > 0 && <span className="feed-filters__count">{filterCounts.market}</span>}
              </button>
            </div>
          </div>
        </div>

        {/* Realtime toast — "X new updates" */}
        <AnimatePresence>
          {realtime.pendingCount > 0 && (
            <motion.button
              className="feed-new-toast"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              onClick={handleMergeRealtime}
            >
              <Lightning size={14} weight="fill" />
              {realtime.pendingCount} new update{realtime.pendingCount > 1 ? "s" : ""}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Main feed layout */}
        <div className="unified-feed">
          {/* LEFT: Feed stream */}
          <div className="unified-feed__main">
            <MarketPulse />

            {/* Feed content */}
            {isLoading ? (
              <FeedSkeleton />
            ) : visibleItems.length === 0 ? (
              <div className="feed-empty">
                <ChartLineUp size={32} style={{ margin: "0 auto", opacity: 0.5 }} />
                <h3 className="feed-empty__title">
                  {!feedFilters.posts && !feedFilters.circles && !feedFilters.market
                    ? "All filters are off"
                    : "Network is quiet"}
                </h3>
                <p className="feed-empty__text">
                  {!feedFilters.posts && !feedFilters.circles && !feedFilters.market
                    ? "Turn on at least one filter to see your feed."
                    : "No activity yet. Be the first to participate."}
                </p>
                {feedFilters.market && (
                  <Link href="/explore" className="btn-solid" style={{ marginTop: 16, display: "inline-block" }}>
                    Explore Marketplace
                  </Link>
                )}
              </div>
            ) : (
              <>
                <div className="feed-stream">
                  {visibleItems.map((item, idx) => {
                    switch (item.type) {
                      case "public_post": {
                        const post = item.data as PublicPost;
                        return (
                          <motion.div
                            key={item.id}
                            className="feed-stream__item"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
                          >
                            <PublicPostCard
                              post={post}
                              walletAddress={walletAddress || undefined}
                              isOwner={!!humanofiUser?.creator?.mint_address && humanofiUser.creator.mint_address === post.creator_mint}
                              onDelete={handlePublicDelete}
                              onUpdate={handlePublicUpdate}
                              onReactionChange={handlePublicReactionChange}
                            />
                          </motion.div>
                        );
                      }
                      case "circle_post": {
                        const post = item.data as typeof circlePosts[number];
                        return (
                          <motion.div
                            key={item.id}
                            className="feed-stream__item circle-post-wrapper"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
                          >
                            <div className="circle-post-badge"><Lock size={12} weight="bold" /> My Humano</div>
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
                          </motion.div>
                        );
                      }
                      case "event": {
                        const evt = item.data as FeedEventData;
                        if (evt.event_type === "new_creator") {
                          return (
                            <motion.div
                              key={item.id}
                              className="feed-stream__item"
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
                            >
                              <NewCreatorCard event={evt} />
                            </motion.div>
                          );
                        }
                        return (
                          <motion.div
                            key={item.id}
                            className="feed-stream__item"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
                          >
                            <FeedEventCard event={evt} />
                          </motion.div>
                        );
                      }
                      case "trade_group": {
                        return (
                          <motion.div
                            key={item.id}
                            className="feed-stream__item"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
                          >
                            <TradeSignalGroup trades={item.data as FeedEventData[]} />
                          </motion.div>
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
          <FeedSidebar walletAddress={walletAddress} authenticated={authenticated} refreshKey={realtime.sidebarRefreshKey} />
        </div>
      </main>

      <Footer />
    </>
  );
}

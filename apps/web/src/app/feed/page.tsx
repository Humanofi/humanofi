"use client";

import { useEffect, useState, useCallback } from "react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import { useHumanofi } from "@/hooks/useHumanofi";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import Image from "next/image";
import PostCard, { PostData } from "@/components/inner-circle/PostCard";
import PublicPostCard, { PublicPost } from "@/components/public-feed/PublicPostCard";
import { Globe, Users, Fire, Clock } from "@phosphor-icons/react";
import { toast } from "sonner";

type FeedTab = "public" | "circles";

export default function UnifiedFeedPage() {
  const { walletAddress } = useHumanofi();
  const { user: humanofiUser } = useSupabaseAuth();
  const { authenticated, login } = usePrivy();

  const [tab, setTab] = useState<FeedTab>("public");

  // Public feed state
  const [publicPosts, setPublicPosts] = useState<PublicPost[]>([]);
  const [publicLoading, setPublicLoading] = useState(true);
  const [publicSort, setPublicSort] = useState<"hot" | "new">("hot");

  // Circles feed state
  const [circlePosts, setCirclePosts] = useState<(PostData & { creatorInfo: any })[]>([]);
  const [circleLoading, setCircleLoading] = useState(true);
  const [userVotes, setUserVotes] = useState<Record<string, number>>({});
  const [userRsvps, setUserRsvps] = useState<Record<string, string>>({});

  // Fetch public feed
  const fetchPublicFeed = useCallback(async () => {
    try {
      setPublicLoading(true);
      const headers: Record<string, string> = {};
      if (walletAddress) headers["x-wallet-address"] = walletAddress;
      const res = await fetch("/api/public-posts?limit=50", { headers });
      if (res.ok) {
        const data = await res.json();
        let posts = data.posts || [];
        if (publicSort === "new") {
          posts.sort((a: PublicPost, b: PublicPost) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        }
        setPublicPosts(posts);
      }
    } catch (err) {
      console.error("Public feed error:", err);
    } finally {
      setPublicLoading(false);
    }
  }, [walletAddress, publicSort]);

  // Fetch circles feed
  const fetchCirclesFeed = useCallback(async () => {
    if (!walletAddress) { setCircleLoading(false); return; }
    try {
      setCircleLoading(true);
      const res = await fetch("/api/feed", { headers: { "x-wallet-address": walletAddress } });
      if (!res.ok) { setCircleLoading(false); return; }
      const data = await res.json();
      if (data.userVotes) setUserVotes(data.userVotes);
      if (data.userRsvps) setUserRsvps(data.userRsvps);

      const fetched = (data.posts || []).map((p: any) => ({
        id: p.id, content: p.content || "", post_type: p.post_type || "text",
        metadata: p.metadata || {}, image_urls: p.image_urls || [], media_urls: p.media_urls || [],
        is_pinned: p.is_pinned || false, creator_mint: p.creator_mint,
        created_at: p.created_at, reactions: {}, userReactions: [], reply_count: 0,
        creatorInfo: p.creator_tokens || { display_name: "Unknown", avatar_url: null },
      }));

      // Fetch reactions
      const mintGroups: Record<string, string[]> = {};
      fetched.forEach((p: any) => {
        if (!mintGroups[p.creator_mint]) mintGroups[p.creator_mint] = [];
        mintGroups[p.creator_mint].push(p.id);
      });
      await Promise.all(Object.entries(mintGroups).map(async ([mint, ids]) => {
        try {
          const rr = await fetch(`/api/inner-circle/${mint}/reactions?postIds=${ids.join(",")}`, {
            headers: { "x-wallet-address": walletAddress },
          });
          if (rr.ok) {
            const rd = await rr.json();
            fetched.forEach((p: any) => {
              if (ids.includes(p.id)) {
                p.reactions = rd.reactions?.[p.id] || {};
                p.userReactions = rd.userReactions?.[p.id] || [];
              }
            });
          }
        } catch { /* silent */ }
      }));

      setCirclePosts(fetched);
    } catch (err) {
      console.error("Circles feed error:", err);
    } finally {
      setCircleLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (tab === "public") fetchPublicFeed();
  }, [tab, fetchPublicFeed]);

  useEffect(() => {
    if (tab === "circles" && authenticated && walletAddress) fetchCirclesFeed();
    else if (tab === "circles") setCircleLoading(false);
  }, [tab, authenticated, walletAddress, fetchCirclesFeed]);

  // Handlers
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
    const res = await fetch(`/api/inner-circle/${post.creator_mint}/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-wallet-address": walletAddress || "" },
      body: JSON.stringify({ postId, optionIndex }),
    });
    if (res.ok) {
      setUserVotes((prev) => ({ ...prev, [postId]: optionIndex }));
      toast.success("Vote recorded!");
      fetchCirclesFeed();
    } else toast.error((await res.json()).error || "Failed to vote");
  }, [circlePosts, walletAddress, fetchCirclesFeed]);

  const handleRsvp = useCallback(async (postId: string, status: string) => {
    const post = circlePosts.find((p) => p.id === postId);
    if (!post) return;
    const res = await fetch(`/api/inner-circle/${post.creator_mint}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-wallet-address": walletAddress || "" },
      body: JSON.stringify({ postId, status }),
    });
    if (res.ok) {
      setUserRsvps((prev) => ({ ...prev, [postId]: status }));
      toast.success(status === "going" ? "You're going!" : "Marked as interested");
    }
  }, [circlePosts, walletAddress]);

  const circleCount = new Set(circlePosts.map((p) => p.creator_mint)).size;

  return (
    <>
      <div className="halftone-bg" />
      <Topbar />
      <main className="page feed-page">
        {/* Header */}
        <div className="feed-header">
          <div className="feed-header__text">
            <h1 className="feed-header__title">Feed</h1>
            <p className="feed-header__sub">
              {tab === "public" ? "Discover what creators are sharing with the world." : "Exclusive content from your Inner Circles."}
            </p>
          </div>
        </div>

        {/* Main tabs */}
        <div className="feed-tabs">
          <button className={`feed-tab ${tab === "public" ? "feed-tab--active" : ""}`} onClick={() => setTab("public")}>
            <Globe size={16} weight="bold" /> Public
          </button>
          <button
            className={`feed-tab ${tab === "circles" ? "feed-tab--active" : ""}`}
            onClick={() => { if (!authenticated) { login(); return; } setTab("circles"); }}
          >
            <Users size={16} weight="bold" /> My Circles
            {circleCount > 0 && <span className="feed-tab__count">{circleCount}</span>}
          </button>
        </div>

        {/* ═══ PUBLIC TAB ═══ */}
        {tab === "public" && (
          <>
            <div className="pub-feed__sorts">
              <button className={`pub-feed__sort ${publicSort === "hot" ? "pub-feed__sort--active" : ""}`} onClick={() => setPublicSort("hot")}>
                <Fire size={14} weight="bold" /> Trending
              </button>
              <button className={`pub-feed__sort ${publicSort === "new" ? "pub-feed__sort--active" : ""}`} onClick={() => setPublicSort("new")}>
                <Clock size={14} weight="bold" /> Latest
              </button>
            </div>

            {publicLoading ? (
              <div className="feed-loading"><div className="feed-loading__spinner" /><span>Loading public feed...</span></div>
            ) : publicPosts.length > 0 ? (
              <div className="pub-feed__posts">
                {publicPosts.map((post) => (
                  <PublicPostCard key={post.id} post={post}
                    walletAddress={walletAddress || undefined}
                    isOwner={!!humanofiUser?.mint_address && humanofiUser.mint_address === post.creator_mint}
                    onDelete={handlePublicDelete}
                    onUpdate={handlePublicUpdate}
                    onReactionChange={handlePublicReactionChange}
                  />
                ))}
              </div>
            ) : (
              <div className="feed-empty">
                <div className="feed-empty__icon">📡</div>
                <h2 className="feed-empty__title">No public posts yet</h2>
                <p className="feed-empty__text">Creators haven&apos;t published public updates yet. Check back soon!</p>
              </div>
            )}
          </>
        )}

        {/* ═══ CIRCLES TAB ═══ */}
        {tab === "circles" && (
          <>
            {!authenticated ? (
              <div className="feed-empty">
                <div className="feed-empty__icon">◈</div>
                <h2 className="feed-empty__title">Connect to see your circles</h2>
                <p className="feed-empty__text">Your personalized timeline from the creators whose tokens you hold.</p>
                <button className="btn-solid" onClick={login} style={{ marginTop: 20 }}>Connect Wallet</button>
              </div>
            ) : circleLoading ? (
              <div className="feed-loading"><div className="feed-loading__spinner" /><span>Loading your circles...</span></div>
            ) : circlePosts.length > 0 ? (
              <div className="feed-posts">
                {circlePosts.map((post) => (
                  <div key={post.id} className="feed-post-wrapper">
                    <Link href={`/person/${post.creator_mint}/inner-circle`} className="feed-post__creator-link">
                      <Image src={(post as any).creatorInfo.avatar_url || "/default-avatar.png"} alt={(post as any).creatorInfo.display_name} width={20} height={20} style={{ borderRadius: "50%", objectFit: "cover" }} />
                      <span>{(post as any).creatorInfo.display_name}&apos;s Circle</span>
                    </Link>
                    <PostCard post={post}
                      creatorName={(post as any).creatorInfo.display_name}
                      creatorAvatar={(post as any).creatorInfo.avatar_url || "/default-avatar.png"}
                      walletAddress={walletAddress || ""}
                      onVote={handleVote} onRsvp={handleRsvp}
                      onReactionChange={handleCircleReactionChange}
                      userVotes={userVotes} userRsvps={userRsvps}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="feed-empty">
                <div className="feed-empty__icon">✨</div>
                <h2 className="feed-empty__title">Your circles are empty</h2>
                <p className="feed-empty__text">Hold creator tokens to see their exclusive content here.</p>
                <Link href="/" className="btn-solid" style={{ marginTop: 20, display: "inline-block" }}>Explore Creators →</Link>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

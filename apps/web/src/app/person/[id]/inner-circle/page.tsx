"use client";

import { useEffect, useState, useCallback } from "react";
import { usePerson } from "../layout";
import { usePrivy } from "@privy-io/react-auth";
import { useHumanofi } from "@/hooks/useHumanofi";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import PostCard, { PostData } from "@/components/inner-circle/PostCard";
import PostComposer from "@/components/inner-circle/PostComposer";
import PresenceSidebar from "@/components/inner-circle/PresenceSidebar";
import FlyingEmojis from "@/components/inner-circle/FlyingEmojis";
import { Archive } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function InnerCirclePage() {
  const { creator, isHolder, isCreator, loading: layoutLoading } = usePerson();
  const { authenticated, login } = usePrivy();
  const { walletAddress } = useHumanofi();

  const [posts, setPosts] = useState<PostData[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [userVotes, setUserVotes] = useState<Record<string, number>>({});
  const [userRsvps, setUserRsvps] = useState<Record<string, string>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [holderBalance, setHolderBalance] = useState(0);

  const [stats24h, setStats24h] = useState<{ reactions: number; posts: number }>({ reactions: 0, posts: 0 });

  const { onlineUsers, onlineCount, liveReactions, sendReaction, consumeReaction } =
    useRealtimeChannel(
      isHolder || isCreator ? creator?.mint_address || null : null,
      walletAddress || null
    );

  // Fetch posts + reactions
  const fetchPosts = useCallback(async () => {
    if (!creator?.mint_address || (!isHolder && !isCreator)) {
      setLoadingPosts(false);
      return;
    }
    setLoadingPosts(true);
    try {
      const archiveParam = isCreator ? "&include_archived=true" : "";
      const res = await fetch(`/api/inner-circle/${creator.mint_address}/posts?${archiveParam}`, {
        headers: { "x-wallet-address": walletAddress || "" },
      });
      if (!res.ok) { setLoadingPosts(false); return; }

      const data = await res.json();
      if (data.userVotes) setUserVotes(data.userVotes);
      if (data.userRsvps) setUserRsvps(data.userRsvps);
      if (typeof data.holderBalance === "number") setHolderBalance(data.holderBalance);

      const fetchedPosts: PostData[] = (data.posts || []).map((p: any) => ({
        id: p.id,
        content: p.content || "",
        post_type: p.post_type || "text",
        metadata: p.metadata || {},
        image_urls: p.image_urls || [],
        media_urls: p.media_urls || [],
        is_pinned: p.is_pinned || false,
        is_archived: p.is_archived || false,
        creator_mint: p.creator_mint || creator.mint_address,
        created_at: p.created_at,
        reactions: {},
        userReactions: [],
        reply_count: 0,
      }));

      // Fetch reactions in bulk
      if (fetchedPosts.length > 0) {
        const postIds = fetchedPosts.map((p) => p.id).join(",");
        const reactRes = await fetch(
          `/api/inner-circle/${creator.mint_address}/reactions?postIds=${postIds}`,
          { headers: { "x-wallet-address": walletAddress || "" } }
        );
        if (reactRes.ok) {
          const reactData = await reactRes.json();
          fetchedPosts.forEach((p) => {
            p.reactions = reactData.reactions?.[p.id] || {};
            p.userReactions = reactData.userReactions?.[p.id] || [];
          });
        }
      }

      setPosts(fetchedPosts);
    } catch (err) {
      console.error("Failed to load posts", err);
    } finally {
      setLoadingPosts(false);
    }
  }, [creator?.mint_address, isHolder, isCreator, walletAddress]);

  useEffect(() => {
    if (!layoutLoading) fetchPosts();
  }, [layoutLoading, fetchPosts]);

  // Fetch 24h stats
  useEffect(() => {
    if (!creator?.mint_address || (!isHolder && !isCreator)) return;
    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/inner-circle/${creator.mint_address}/stats24h`);
        if (res.ok) {
          const data = await res.json();
          setStats24h(data);
        }
      } catch { /* silent */ }
    };
    fetchStats();
  }, [creator?.mint_address, isHolder, isCreator]);

  // Reaction change handler (local optimistic update)
  const handleReactionChange = useCallback(
    (postId: string, reactions: Record<string, number>, userReactions: string[]) => {
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, reactions, userReactions } : p))
      );
      // Also broadcast for flying emojis
      const lastEmoji = userReactions[userReactions.length - 1];
      if (lastEmoji) {
        sendReaction(lastEmoji, postId);
      }
    },
    [sendReaction]
  );

  // Poll vote
  const handleVote = useCallback(
    async (postId: string, optionIndex: number) => {
      if (!creator?.mint_address) return;
      const res = await fetch(`/api/inner-circle/${creator.mint_address}/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet-address": walletAddress || "" },
        body: JSON.stringify({ postId, optionIndex }),
      });
      if (res.ok) {
        setUserVotes((prev) => ({ ...prev, [postId]: optionIndex }));
        toast.success("Vote recorded!");
        fetchPosts();
      } else {
        toast.error((await res.json()).error || "Failed to vote");
      }
    },
    [creator?.mint_address, walletAddress, fetchPosts]
  );

  // Event RSVP
  const handleRsvp = useCallback(
    async (postId: string, status: string) => {
      if (!creator?.mint_address) return;
      const res = await fetch(`/api/inner-circle/${creator.mint_address}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet-address": walletAddress || "" },
        body: JSON.stringify({ postId, status }),
      });
      if (res.ok) {
        setUserRsvps((prev) => ({ ...prev, [postId]: status }));
        toast.success(status === "going" ? "You're going!" : "Marked as interested");
      }
    },
    [creator?.mint_address, walletAddress]
  );

  // Delete post
  const handleDelete = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  // Update post (edit / archive)
  const handleUpdate = useCallback((postId: string, updates: Partial<PostData>) => {
    setPosts((prev) => {
      const next = prev.map((p) => (p.id === postId ? { ...p, ...updates } : p));
      // If we just un-archived the last archived post, switch back to feed
      if (updates.is_archived === false && !next.some((p) => p.is_archived)) {
        setShowArchived(false);
      }
      return next;
    });
  }, []);

  const nextEvent = posts
    .filter((p) => p.post_type === "event" && p.metadata?.event_date)
    .filter((p) => new Date(p.metadata.event_date as string) > new Date())
    .sort((a, b) => new Date(a.metadata.event_date as string).getTime() - new Date(b.metadata.event_date as string).getTime())[0];

  if (layoutLoading) return null;

  // Locked view
  if (!isHolder && !isCreator) {
    return (
      <div className="ic-locked">
        <div className="ic-locked__icon">◈</div>
        <div className="ic-locked__title">Inner Circle Locked</div>
        <div className="ic-locked__text">
          {authenticated
            ? `Hold ${creator?.display_name?.split(" ")[0]}'s tokens to unlock exclusive content, events, and community.`
            : "Connect your wallet and hold tokens to access."}
        </div>
        <div className="ic-locked__features">
          <div className="ic-locked__feature">💬 Exclusive posts & media</div>
          <div className="ic-locked__feature">📊 Vote in polls</div>
          <div className="ic-locked__feature">📅 Join private events</div>
          <div className="ic-locked__feature">🔴 Watch live webinars</div>
          <div className="ic-locked__feature">🏆 Earn badges & streaks</div>
        </div>
        {!authenticated ? (
          <button className="btn-solid" onClick={login}>Connect Wallet</button>
        ) : (
          <span className="ic-locked__cta">Buy tokens on the Profile & Trade tab →</span>
        )}
      </div>
    );
  }

  return (
    <>
      <FlyingEmojis reactions={liveReactions} onConsumed={consumeReaction} />

      <div className="ic-layout">
        <PresenceSidebar
          onlineCount={onlineCount}
          onlineUsers={onlineUsers}
          stats24h={stats24h}
          nextEvent={nextEvent ? { title: (nextEvent.metadata.event_title as string) || nextEvent.content, date: nextEvent.metadata.event_date as string } : null}
        />

        <div className="ic-feed">
          {isCreator && creator && walletAddress && (
            <PostComposer mintAddress={creator.mint_address} walletAddress={walletAddress} onPublished={fetchPosts} />
          )}

          {/* Archive toggle (creator only) */}
          {isCreator && posts.some((p) => p.is_archived) && (
            <button
              className={`ic-feed__archive-toggle ${showArchived ? "ic-feed__archive-toggle--active" : ""}`}
              onClick={() => setShowArchived(!showArchived)}
            >
              <Archive size={16} weight={showArchived ? "fill" : "regular"} />
              {showArchived ? "Back to Feed" : `Archive (${posts.filter((p) => p.is_archived).length})`}
            </button>
          )}

          {loadingPosts ? (
            <div className="ic-feed__loading">Loading feed...</div>
          ) : (() => {
            const filtered = showArchived
              ? posts.filter((p) => p.is_archived)
              : posts.filter((p) => !p.is_archived);
            return filtered.length > 0 ? (
              <>
                {filtered.filter((p) => p.is_pinned && !showArchived).map((post) => (
                  <PostCard key={post.id} post={post}
                    creatorName={creator?.display_name || ""} creatorAvatar={creator?.avatar_url || "/default-avatar.png"}
                    isCreator={isCreator} walletAddress={walletAddress || ""} holderBalance={holderBalance} onVote={handleVote} onRsvp={handleRsvp} onDelete={handleDelete} onUpdate={handleUpdate}
                    onReactionChange={handleReactionChange} userVotes={userVotes} userRsvps={userRsvps}
                  />
                ))}
                {filtered.filter((p) => !p.is_pinned || showArchived).map((post) => (
                  <PostCard key={post.id} post={post}
                    creatorName={creator?.display_name || ""} creatorAvatar={creator?.avatar_url || "/default-avatar.png"}
                    isCreator={isCreator} walletAddress={walletAddress || ""} holderBalance={holderBalance} onVote={handleVote} onRsvp={handleRsvp} onDelete={handleDelete} onUpdate={handleUpdate}
                    onReactionChange={handleReactionChange} userVotes={userVotes} userRsvps={userRsvps}
                  />
                ))}
              </>
            ) : (
            <div className="ic-feed__empty">
              <div className="ic-feed__empty-icon">✨</div>
              <div className="ic-feed__empty-title">{showArchived ? "No archived posts" : "No posts yet"}</div>
              <div className="ic-feed__empty-text">
                {showArchived
                  ? "Archived posts will appear here."
                  : isCreator ? "Start sharing with your holders!" : `${creator?.display_name?.split(" ")[0]} hasn't posted yet. Stay tuned!`}
              </div>
            </div>
            );
          })()}
        </div>
      </div>
    </>
  );
}

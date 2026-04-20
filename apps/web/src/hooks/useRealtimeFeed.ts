// ========================================
// Humanofi — Realtime Feed Hook V4
// ========================================
// Subscribes to Supabase Realtime for live feed updates.
// 2 channels:
//   1. feed_events (trades, whales, milestones)
//   2. public_posts (creator posts)
// Reactions are handled via optimistic UI — no realtime channel needed.

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type { FeedEventData } from "@/components/FeedEventCard";
import type { PublicPost } from "@/components/public-feed/PublicPostCard";

export interface RealtimeFeedState {
  /** Buffered new feed events not yet merged into the feed */
  pendingEvents: FeedEventData[];
  /** Buffered new public posts not yet merged into the feed */
  pendingPosts: PublicPost[];
  /** Total pending items count */
  pendingCount: number;
  /** Flush all pending items — returns them and clears the buffer */
  flushPending: () => { events: FeedEventData[]; posts: PublicPost[] };
  /** Whether currently connected to realtime */
  isConnected: boolean;
  /** Latest event for the LiveTradeTicker (single item stream) */
  latestTickerEvent: FeedEventData | null;
  /** Counter that increments on relevant feed_events — used to trigger sidebar refresh */
  sidebarRefreshKey: number;
}

// Rate limit: max 1 event buffered per second to avoid overwhelming the UI
const RATE_LIMIT_MS = 1000;

export function useRealtimeFeed(): RealtimeFeedState {
  const [pendingEvents, setPendingEvents] = useState<FeedEventData[]>([]);
  const [pendingPosts, setPendingPosts] = useState<PublicPost[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [latestTickerEvent, setLatestTickerEvent] = useState<FeedEventData | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  const lastEventTime = useRef<number>(0);
  const eventBuffer = useRef<FeedEventData[]>([]);
  const flushTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Buffer flush — rate-limited
  const processEventBuffer = useCallback(() => {
    if (eventBuffer.current.length === 0) return;

    const now = Date.now();
    const timeSinceLastEvent = now - lastEventTime.current;

    if (timeSinceLastEvent >= RATE_LIMIT_MS) {
      // Flush immediately
      const batch = [...eventBuffer.current];
      eventBuffer.current = [];
      lastEventTime.current = now;
      setPendingEvents(prev => [...prev, ...batch]);
    } else {
      // Schedule flush after remaining rate limit time
      if (!flushTimeout.current) {
        flushTimeout.current = setTimeout(() => {
          flushTimeout.current = null;
          processEventBuffer();
        }, RATE_LIMIT_MS - timeSinceLastEvent);
      }
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;

    // ── Channel 1: feed_events (trades, whales, milestones, new_creator, etc.) ──
    const feedChannel = supabase
      .channel("feed-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feed_events" },
        (payload) => {
          const raw = payload.new as Record<string, unknown>;
          
          const event: FeedEventData = {
            id: raw.id as string,
            event_type: raw.event_type as string,
            mint_address: raw.mint_address as string,
            wallet_address: (raw.wallet_address as string) || null,
            data: (raw.data as Record<string, unknown>) || {},
            created_at: raw.created_at as string,
            creator_tokens: {
              display_name: ((raw.data as Record<string, unknown>)?.display_name as string) || "...",
              avatar_url: null,
              category: "",
            },
          };

          // Always update the ticker immediately (no rate limit for the ticker)
          setLatestTickerEvent(event);

          // Trigger sidebar refresh for relevant events
          const refreshTypes = ["trade", "new_creator", "new_holder", "whale_alert", "milestone"];
          if (refreshTypes.includes(event.event_type)) {
            setSidebarRefreshKey(prev => prev + 1);
          }

          // Buffer the event for the feed
          eventBuffer.current.push(event);
          processEventBuffer();
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          console.log("[RealtimeFeed] ✅ Connected to feed-live channel");
        }
      });

    // ── Channel 2: public_posts (new creator posts) ──
    const postsChannel = supabase
      .channel("posts-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "public_posts" },
        (payload) => {
          const raw = payload.new as Record<string, unknown>;
          
          const post: PublicPost = {
            id: raw.id as string,
            creator_mint: raw.creator_mint as string,
            content: (raw.content as string) || "",
            media_urls: (raw.media_urls as string[]) || [],
            created_at: raw.created_at as string,
            reaction_count: 0,
            hot_score: (raw.hot_score as number) || 0,
            reactions: {},
            userReactions: [],
            holderCount: 0,
            creator_tokens: {
              display_name: "...",
              avatar_url: null,
              category: "",
            },
          };

          setPendingPosts(prev => [...prev, post]);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[RealtimeFeed] ✅ Connected to posts-live channel");
        }
      });

    return () => {
      if (flushTimeout.current) clearTimeout(flushTimeout.current);
      if (supabase) {
        supabase.removeChannel(feedChannel);
        supabase.removeChannel(postsChannel);
      }
    };
  }, [processEventBuffer]);

  // Flush pending — called when user clicks "X new updates" toast
  const flushPending = useCallback(() => {
    const flushedEvents = [...pendingEvents];
    const flushedPosts = [...pendingPosts];
    setPendingEvents([]);
    setPendingPosts([]);
    return { events: flushedEvents, posts: flushedPosts };
  }, [pendingEvents, pendingPosts]);

  return {
    pendingEvents,
    pendingPosts,
    pendingCount: pendingEvents.length + pendingPosts.length,
    flushPending,
    isConnected,
    latestTickerEvent,
    sidebarRefreshKey,
  };
}

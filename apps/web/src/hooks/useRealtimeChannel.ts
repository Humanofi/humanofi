// ========================================
// Humanofi — Supabase Realtime Channel Hook
// ========================================
// Manages Broadcast (reactions, emojis) + Presence (who's online)
// for a specific token's Inner Circle.

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";

export interface OnlineUser {
  wallet_address: string;
  joined_at: string;
}

export interface RealtimeReaction {
  emoji: string;
  wallet_address: string;
  post_id?: string;
  timestamp: number;
}

export function useRealtimeChannel(mintAddress: string | null, walletAddress: string | null) {
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [liveReactions, setLiveReactions] = useState<RealtimeReaction[]>([]);

  // Connect to channel
  useEffect(() => {
    if (!supabase || !mintAddress || !walletAddress) return;

    const channelName = `inner-circle:${mintAddress}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: { key: walletAddress },
        broadcast: { self: true },
      },
    });

    // Presence: track who's online
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const users: OnlineUser[] = [];
      for (const [key, presences] of Object.entries(state)) {
        if (Array.isArray(presences) && presences.length > 0) {
          users.push({
            wallet_address: key,
            joined_at: (presences[0] as { joined_at?: string }).joined_at || "",
          });
        }
      }
      setOnlineUsers(users);
      setOnlineCount(users.length);
    });

    // Broadcast: live reactions
    channel.on("broadcast", { event: "reaction" }, (payload) => {
      const reaction = payload.payload as RealtimeReaction;
      setLiveReactions((prev) => [...prev.slice(-30), reaction]); // Keep last 30
    });

    // Subscribe and track presence
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          wallet_address: walletAddress,
          joined_at: new Date().toISOString(),
        });
      }
    });

    channelRef.current = channel;

    return () => {
      if (supabase && channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [mintAddress, walletAddress]);

  // Send a reaction broadcast
  const sendReaction = useCallback(
    (emoji: string, postId?: string) => {
      if (!channelRef.current || !walletAddress) return;
      channelRef.current.send({
        type: "broadcast",
        event: "reaction",
        payload: {
          emoji,
          wallet_address: walletAddress,
          post_id: postId,
          timestamp: Date.now(),
        },
      });
    },
    [walletAddress]
  );

  // Clear a consumed reaction
  const consumeReaction = useCallback((timestamp: number) => {
    setLiveReactions((prev) => prev.filter((r) => r.timestamp !== timestamp));
  }, []);

  return {
    onlineUsers,
    onlineCount,
    liveReactions,
    sendReaction,
    consumeReaction,
  };
}

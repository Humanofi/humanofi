// ========================================
// Humanofi — Streak Tracking Hook
// ========================================
// Tracks daily engagement streaks for holders.
// Each day a holder interacts (react, vote, comment), the streak grows.

"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthFetch } from "@/lib/authFetch";

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  badge: string;
  lastActiveDate: string | null;
  isActiveToday: boolean;
}

const BADGE_THRESHOLDS: [number, string][] = [
  [365, "legendary"],
  [100, "og"],
  [30, "loyalist"],
  [7, "engaged"],
  [3, "curious"],
  [0, "none"],
];

function getBadge(streak: number): string {
  for (const [threshold, badge] of BADGE_THRESHOLDS) {
    if (streak >= threshold) return badge;
  }
  return "none";
}

const BADGE_LABELS: Record<string, { emoji: string; label: string }> = {
  none: { emoji: "⬜", label: "New" },
  curious: { emoji: "👀", label: "Curious" },
  engaged: { emoji: "💪", label: "Engaged" },
  loyalist: { emoji: "🛡️", label: "Loyalist" },
  og: { emoji: "👑", label: "OG" },
  legendary: { emoji: "⚡", label: "Legendary" },
};

export { BADGE_LABELS };

export function useStreak(mintAddress: string | null, walletAddress: string | null) {
  const [streak, setStreak] = useState<StreakData>({
    currentStreak: 0,
    longestStreak: 0,
    badge: "none",
    lastActiveDate: null,
    isActiveToday: false,
  });
  const [loading, setLoading] = useState(true);
  const authFetch = useAuthFetch();

  // Fetch streak data
  useEffect(() => {
    async function fetchStreak() {
      if (!mintAddress || !walletAddress) {
        setLoading(false);
        return;
      }

      try {
        const res = await authFetch(`/api/inner-circle/${mintAddress}/streak`);
        if (res.ok) {
          const data = await res.json();
          const today = new Date().toISOString().split("T")[0];
          setStreak({
            currentStreak: data.current_streak || 0,
            longestStreak: data.longest_streak || 0,
            badge: data.badge || getBadge(data.current_streak || 0),
            lastActiveDate: data.last_active_date || null,
            isActiveToday: data.last_active_date === today,
          });
        }
      } catch (err) {
        console.warn("Failed to fetch streak:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStreak();
  }, [mintAddress, walletAddress]);

  // Record activity (call this when user reacts/votes/comments)
  const recordActivity = useCallback(async () => {
    if (!mintAddress || !walletAddress) return;

    try {
      await authFetch(`/api/inner-circle/${mintAddress}/streak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      // Optimistic update
      setStreak((prev) => {
        const newStreak = prev.isActiveToday ? prev.currentStreak : prev.currentStreak + 1;
        return {
          ...prev,
          currentStreak: newStreak,
          longestStreak: Math.max(prev.longestStreak, newStreak),
          badge: getBadge(newStreak),
          lastActiveDate: new Date().toISOString().split("T")[0],
          isActiveToday: true,
        };
      });
    } catch (err) {
      console.warn("Failed to record streak:", err);
    }
  }, [mintAddress, walletAddress]);

  return { streak, loading, recordActivity };
}

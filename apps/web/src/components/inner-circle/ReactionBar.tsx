"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAuthFetch } from "@/lib/authFetch";

const REACTIONS = [
  { emoji: "🔥", label: "Fire" },
  { emoji: "💡", label: "Insightful" },
  { emoji: "🙏", label: "Thanks" },
  { emoji: "🚀", label: "Let's go" },
  { emoji: "❤️", label: "Love" },
  { emoji: "👀", label: "Watching" },
  { emoji: "😅", label: "Sweat" },
  { emoji: "😫", label: "Exhausted" },
  { emoji: "😱", label: "Shocked" },
  { emoji: "🤌", label: "Chef's kiss" },
];

interface ReactionBarProps {
  postId: string;
  mintAddress: string;
  walletAddress: string;
  reactions: Record<string, number>;
  userReactions: string[];
  onReactionChange: (postId: string, reactions: Record<string, number>, userReactions: string[]) => void;
}

export default function ReactionBar({
  postId,
  mintAddress,
  walletAddress,
  reactions,
  userReactions,
  onReactionChange,
}: ReactionBarProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const authFetch = useAuthFetch();

  const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);

  const handleReact = useCallback(
    async (emoji: string) => {
      if (loading) return;
      setLoading(emoji);

      // ── Optimistic update: update UI IMMEDIATELY ──
      const prevReactions = { ...reactions };
      const prevUserReactions = [...userReactions];
      const isSameEmoji = userReactions.includes(emoji);
      const hasExisting = userReactions.length > 0;

      const optimisticReactions = { ...reactions };
      let optimisticUserReactions: string[];

      if (isSameEmoji) {
        // Toggle OFF
        optimisticReactions[emoji] = Math.max(0, (optimisticReactions[emoji] || 0) - 1);
        if (optimisticReactions[emoji] === 0) delete optimisticReactions[emoji];
        optimisticUserReactions = [];
      } else if (hasExisting) {
        // Replace: decrement old, increment new
        const oldEmoji = userReactions[0];
        optimisticReactions[oldEmoji] = Math.max(0, (optimisticReactions[oldEmoji] || 0) - 1);
        if (optimisticReactions[oldEmoji] === 0) delete optimisticReactions[oldEmoji];
        optimisticReactions[emoji] = (optimisticReactions[emoji] || 0) + 1;
        optimisticUserReactions = [emoji];
      } else {
        // Add new
        optimisticReactions[emoji] = (optimisticReactions[emoji] || 0) + 1;
        optimisticUserReactions = [emoji];
      }

      // Apply optimistic state INSTANTLY
      onReactionChange(postId, optimisticReactions, optimisticUserReactions);

      // ── Fire API call in background ──
      try {
        const res = await authFetch(`/api/inner-circle/${mintAddress}/reactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId, emoji }),
        });

        if (!res.ok) {
          // Rollback on error
          onReactionChange(postId, prevReactions, prevUserReactions);
          toast.error("Failed to react");
        }
      } catch {
        // Rollback on network error
        onReactionChange(postId, prevReactions, prevUserReactions);
        toast.error("Failed to react");
      } finally {
        setLoading(null);
      }
    },
    [postId, mintAddress, reactions, userReactions, onReactionChange, loading, authFetch]
  );

  // Show existing reactions as pills + an add button
  const activeEmojis = REACTIONS.filter((r) => (reactions[r.emoji] || 0) > 0);
  const inactiveEmojis = REACTIONS.filter((r) => !(reactions[r.emoji] > 0));

  return (
    <div className="ic-reactions">
      {/* Active reactions */}
      {activeEmojis.map(({ emoji, label }) => {
        const count = reactions[emoji] || 0;
        const isOwn = userReactions.includes(emoji);

        return (
          <motion.button
            key={emoji}
            className={`ic-reactions__pill ${isOwn ? "ic-reactions__pill--own" : ""}`}
            onClick={() => handleReact(emoji)}
            whileTap={{ scale: 0.9 }}
            title={`${label} — ${isOwn ? "Remove" : "Add"}`}
            disabled={loading === emoji}
          >
            <span className="ic-reactions__emoji">{emoji}</span>
            <AnimatePresence mode="wait">
              <motion.span
                key={count}
                className="ic-reactions__count"
                initial={{ y: -8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 8, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {count}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        );
      })}

      {/* Add reaction button */}
      <div className="ic-reactions__add-wrapper">
        <motion.button
          className="ic-reactions__add"
          onClick={() => setShowPicker(!showPicker)}
          whileTap={{ scale: 0.9 }}
          title="Add reaction"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="5.5" cy="6.5" r="1" fill="currentColor" />
            <circle cx="10.5" cy="6.5" r="1" fill="currentColor" />
            <path d="M5 10.5C5.5 11.5 6.5 12 8 12C9.5 12 10.5 11.5 11 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span>+</span>
        </motion.button>

        <AnimatePresence>
          {showPicker && (
            <motion.div
              className="ic-reactions__picker"
              initial={{ opacity: 0, scale: 0.9, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 8 }}
              transition={{ duration: 0.15 }}
            >
              {REACTIONS.map(({ emoji, label }) => {
                const isOwn = userReactions.includes(emoji);
                return (
                  <motion.button
                    key={emoji}
                    className={`ic-reactions__picker-btn ${isOwn ? "ic-reactions__picker-btn--active" : ""}`}
                    onClick={() => { handleReact(emoji); setShowPicker(false); }}
                    whileHover={{ scale: 1.3 }}
                    whileTap={{ scale: 0.85 }}
                    title={label}
                  >
                    {emoji}
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Total count */}
      {totalReactions > 0 && (
        <span className="ic-reactions__total">{totalReactions}</span>
      )}
    </div>
  );
}

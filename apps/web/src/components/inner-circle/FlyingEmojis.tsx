"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import type { RealtimeReaction } from "@/hooks/useRealtimeChannel";

interface FlyingEmoji {
  id: number;
  emoji: string;
  x: number; // random horizontal position (%)
}

interface FlyingEmojisProps {
  reactions: RealtimeReaction[];
  onConsumed: (timestamp: number) => void;
}

export default function FlyingEmojis({ reactions, onConsumed }: FlyingEmojisProps) {
  const [emojis, setEmojis] = useState<FlyingEmoji[]>([]);

  useEffect(() => {
    if (reactions.length === 0) return;

    const latest = reactions[reactions.length - 1];
    const newEmoji: FlyingEmoji = {
      id: latest.timestamp,
      emoji: latest.emoji,
      x: 10 + Math.random() * 80, // 10-90%
    };

    setEmojis((prev) => [...prev.slice(-20), newEmoji]);
    onConsumed(latest.timestamp);

    // Auto-remove after animation
    const timer = setTimeout(() => {
      setEmojis((prev) => prev.filter((e) => e.id !== newEmoji.id));
    }, 2200);

    return () => clearTimeout(timer);
  }, [reactions, onConsumed]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      <AnimatePresence>
        {emojis.map((emoji) => (
          <motion.div
            key={emoji.id}
            initial={{ 
              opacity: 1, 
              y: "100vh", 
              x: `${emoji.x}vw`,
              scale: 0.5,
              rotate: -15 + Math.random() * 30 
            }}
            animate={{ 
              opacity: [1, 1, 0], 
              y: ["100vh", "40vh", "-10vh"],
              scale: [0.5, 1.3, 0.8],
              rotate: [-15, 10, -5],
            }}
            exit={{ opacity: 0 }}
            transition={{ 
              duration: 2,
              ease: [0.2, 0.8, 0.2, 1],
            }}
            style={{
              position: "absolute",
              fontSize: "2.2rem",
              willChange: "transform, opacity",
              filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.15))",
            }}
          >
            {emoji.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

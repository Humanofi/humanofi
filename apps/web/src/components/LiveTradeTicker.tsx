"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Lightning } from "@phosphor-icons/react";
import { getDefaultDisplayName } from "@/lib/identicon";

interface FeedEvent {
  id: string;
  event_type: string;
  mint_address: string;
  wallet_address: string | null;
  data: Record<string, unknown>;
  created_at: string;
  creator_tokens: {
    display_name: string;
    avatar_url: string | null;
    category: string;
  };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatSolShort(lamports: number): string {
  const sol = lamports / 1e9;
  if (sol >= 1) return `${sol.toFixed(1)} SOL`;
  if (sol >= 0.01) return `${sol.toFixed(2)} SOL`;
  return `${sol.toFixed(4)} SOL`;
}

function formatTokensShort(base: number): string {
  const tokens = base / 1e6;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toFixed(0);
}

function walletShort(addr: string | null): string {
  if (!addr) return "???";
  return getDefaultDisplayName(addr);
}

function eventToLabel(e: FeedEvent): { icon: string; text: string; color: string } {
  const name = e.creator_tokens?.display_name?.split(" ")[0] || "???";
  const wallet = walletShort(e.wallet_address);
  const d = e.data || {};

  switch (e.event_type) {
    case "trade": {
      const isBuy = (d.trade_type as string) === "buy";
      const sol = formatSolShort(Number(d.sol_amount) || 0);
      const tokens = formatTokensShort(Number(d.token_amount) || 0);
      return {
        icon: isBuy ? "🟢" : "🔴",
        text: isBuy
          ? `${wallet} bought ${tokens} $${name} for ${sol}`
          : `${wallet} sold ${tokens} $${name} for ${sol}`,
        color: isBuy ? "#22c55e" : "#ef4444",
      };
    }
    case "whale_alert": {
      const sol = formatSolShort(Number(d.sol_amount) || 0);
      const isBuy = (d.trade_type as string) !== "sell";
      return {
        icon: "🐋",
        text: isBuy
          ? `Whale Alert: ${wallet} → ${sol} into $${name}`
          : `🚨 Whale Sell: ${wallet} dumped ${sol} from $${name}`,
        color: isBuy ? "#f59e0b" : "#ef4444",
      };
    }
    case "new_holder":
      return {
        icon: "👋",
        text: `New holder joined $${name}`,
        color: "#3b82f6",
      };
    case "milestone": {
      const milestone = (d.milestone as number) || 0;
      return {
        icon: "🏆",
        text: `$${name} reached ${milestone} holders!`,
        color: "#a855f7",
      };
    }
    case "new_creator":
      return {
        icon: "🚀",
        text: `${name} just launched their token!`,
        color: "#06b6d4",
      };
    default:
      return { icon: "⚡", text: `Activity on $${name}`, color: "var(--text-muted)" };
  }
}

export default function LiveTradeTicker() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Fetch initial events
  useEffect(() => {
    fetch("/api/feed-events?limit=20")
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events || []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded || events.length === 0) return null;

  // Duplicate items for seamless CSS loop
  const items = [...events, ...events];

  return (
    <section className="live-ticker">
      <div className="live-ticker__label">
        <Lightning size={14} weight="fill" />
        <span>LIVE</span>
      </div>
      <div className="live-ticker__track">
        <div className="live-ticker__scroll">
          {items.map((event, i) => {
            const { icon, text, color } = eventToLabel(event);
            return (
              <Link
                key={`${event.id}-${i}`}
                href={`/person/${event.mint_address}`}
                className="live-ticker__item"
              >
                {event.creator_tokens?.avatar_url && (
                  <Image
                    src={event.creator_tokens.avatar_url}
                    alt=""
                    width={20}
                    height={20}
                    className="live-ticker__avatar"
                  />
                )}
                <span className="live-ticker__icon">{icon}</span>
                <span className="live-ticker__text">{text}</span>
                <span className="live-ticker__time" style={{ color }}>
                  {timeAgo(event.created_at)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

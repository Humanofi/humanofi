"use client";

import Image from "next/image";
import Link from "next/link";

export interface FeedEventData {
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

interface FeedEventCardProps {
  event: FeedEventData;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatSolShort(lamports: number): string {
  const sol = lamports / 1e9;
  if (sol >= 1) return `${sol.toFixed(2)} SOL`;
  if (sol >= 0.01) return `${sol.toFixed(3)} SOL`;
  return `${sol.toFixed(4)} SOL`;
}

function formatTokensK(base: number): string {
  const tokens = base / 1e6;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toFixed(0);
}

function walletShort(addr: string | null): string {
  if (!addr) return "Unknown";
  return `${addr.slice(0, 4)}..${addr.slice(-3)}`;
}

export default function FeedEventCard({ event }: FeedEventCardProps) {
  const name = event.creator_tokens?.display_name?.split(" ")[0] || "???";
  const wallet = walletShort(event.wallet_address);
  const d = event.data || {};
  const avatar = event.creator_tokens?.avatar_url || "/default-avatar.png";

  let icon: string;
  let text: string;
  let extraClass = "";

  switch (event.event_type) {
    case "trade": {
      const isBuy = (d.trade_type as string) === "buy";
      const sol = formatSolShort(Number(d.sol_amount) || 0);
      const tokens = formatTokensK(Number(d.token_amount) || 0);
      icon = isBuy ? "🟢" : "🔴";
      text = isBuy
        ? `${wallet} bought ${tokens} $${name} for ${sol}`
        : `${wallet} sold ${tokens} $${name} for ${sol}`;
      break;
    }
    case "whale_alert": {
      const sol = formatSolShort(Number(d.sol_amount) || 0);
      const isBuy = (d.trade_type as string) !== "sell";
      icon = "🐋";
      text = isBuy
        ? `Whale Alert: ${wallet} invested ${sol} into $${name}`
        : `🚨 Whale Sell: ${wallet} dumped ${sol} from $${name}`;
      extraClass = isBuy ? "feed-event--whale" : "feed-event--whale feed-event--whale-sell";
      break;
    }
    case "new_holder":
      icon = "👋";
      text = `New holder joined $${name}'s community`;
      break;
    case "milestone": {
      const milestone = (d.milestone as number) || 0;
      icon = "🏆";
      text = `$${name} just reached ${milestone} holders!`;
      extraClass = "feed-event--milestone";
      break;
    }
    case "new_creator":
      icon = "🚀";
      text = `${name} just launched their token on Humanofi!`;
      extraClass = "feed-event--milestone";
      break;
    default:
      icon = "⚡";
      text = `Activity on $${name}`;
  }

  return (
    <Link
      href={`/person/${event.mint_address}`}
      className={`feed-event ${extraClass}`}
    >
      <Image
        src={avatar}
        alt={name}
        width={32}
        height={32}
        className="feed-event__avatar"
      />
      <span className="feed-event__icon">{icon}</span>
      <div className="feed-event__body">
        <div className="feed-event__text">{text}</div>
        <div className="feed-event__time">{timeAgo(event.created_at)}</div>
      </div>
    </Link>
  );
}

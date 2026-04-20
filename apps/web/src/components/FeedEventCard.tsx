"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, Pulse, Users, Trophy, RocketLaunch, SignOut, Lightning } from "@phosphor-icons/react";

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

  let iconNode: React.ReactNode;
  let text: React.ReactNode;
  let extraClass = "";

  switch (event.event_type) {
    case "trade": {
      const isBuy = (d.trade_type as string) === "buy";
      const sol = formatSolShort(Number(d.sol_amount) || 0);
      const tokens = formatTokensK(Number(d.token_amount) || 0);
      
      iconNode = isBuy 
        ? <ArrowUpRight size={18} weight="bold" color="#22c55e" /> 
        : <ArrowDownRight size={18} weight="bold" color="#ef4444" />;
        
      text = isBuy
        ? <><span className="feed-event__highlight">{wallet}</span> bought <strong>{tokens} ${name}</strong> for <span className="feed-event__money">{sol}</span></>
        : <><span className="feed-event__highlight">{wallet}</span> sold <strong>{tokens} ${name}</strong> for <span className="feed-event__money">{sol}</span></>;
      break;
    }
    case "whale_alert": {
      const sol = formatSolShort(Number(d.sol_amount) || 0);
      const isBuy = (d.trade_type as string) !== "sell";
      
      iconNode = <Pulse size={18} weight="bold" color={isBuy ? "#22c55e" : "#ef4444"} />;
      
      text = isBuy
        ? <><strong>Whale Alert:</strong> <span className="feed-event__highlight">{wallet}</span> invested <span className="feed-event__money">{sol}</span> into ${name}</>
        : <><strong>Whale Sell:</strong> <span className="feed-event__highlight">{wallet}</span> dumped <span className="feed-event__money">{sol}</span> from ${name}</>;
      extraClass = isBuy ? "feed-event--whale" : "feed-event--whale feed-event--whale-sell";
      break;
    }
    case "new_holder":
      iconNode = <Users size={18} weight="fill" color="var(--accent)" />;
      text = <>New backer joined <strong>${name}</strong>'s community</>;
      break;
    case "milestone": {
      const milestone = (d.milestone as number) || 0;
      iconNode = <Trophy size={18} weight="fill" color="#f59e0b" />;
      text = <><strong>${name}</strong> just reached {milestone} backers!</>;
      extraClass = "feed-event--milestone";
      break;
    }
    case "new_creator":
      iconNode = <RocketLaunch size={18} weight="fill" color="#a855f7" />;
      text = <><strong>{name}</strong> just launched their token on Humanofi!</>;
      extraClass = "feed-event--milestone";
      break;
    case "holder_exit": {
      const heldDays = (d.held_for_days as number) || 0;
      const wasEarly = (d.was_early_believer as boolean) || false;
      iconNode = <SignOut size={18} weight="bold" color="#ef4444" />;
      text = wasEarly
        ? <>An <span style={{ color: "#ef4444", fontWeight: 800 }}>Early Believer</span> left <strong>${name}</strong> after {heldDays}d</>
        : <>A holder exited <strong>${name}</strong> after {heldDays}d</>;
      extraClass = "feed-event--exit";
      break;
    }
    default:
      iconNode = <Lightning size={18} weight="fill" color="var(--text-muted)" />;
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
      <div className="feed-event__icon-wrapper">{iconNode}</div>
      <div className="feed-event__body">
        <div className="feed-event__text">{text}</div>
        <div className="feed-event__time">{timeAgo(event.created_at)}</div>
      </div>
    </Link>
  );
}

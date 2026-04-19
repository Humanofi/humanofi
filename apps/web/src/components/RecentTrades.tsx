"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Heartbeat } from "@phosphor-icons/react";
import { generateIdenticon, getDefaultDisplayName } from "@/lib/identicon";

interface TradeEvent {
  id: string;
  wallet_address: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

interface RecentTradesProps {
  mintAddress: string;
  limit?: number;
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

function formatTokens(base: number): string {
  const tokens = base / 1e6;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toFixed(0);
}

export default function RecentTrades({ mintAddress, limit = 5 }: RecentTradesProps) {
  const [trades, setTrades] = useState<TradeEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mintAddress) return;
    fetch(`/api/feed-events?mint=${mintAddress}&type=trade&limit=${limit}`)
      .then((r) => r.json())
      .then((data) => {
        setTrades(data.events || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [mintAddress, limit]);

  if (loading) return null;

  return (
    <div className="recent-trades">
      <div className="recent-trades__header">
        <Heartbeat size={16} weight="bold" style={{ color: "var(--accent)" }} />
        Recent Trades
      </div>

      {trades.length === 0 ? (
        <div className="recent-trades__empty">No trades yet</div>
      ) : (
        <div className="recent-trades__list">
          {trades.map((trade) => {
            const isBuy = (trade.data?.trade_type as string) === "buy";
            const wallet = trade.wallet_address
              ? `${trade.wallet_address.slice(0, 4)}..${trade.wallet_address.slice(-3)}`
              : "???";
            const tokens = formatTokens(Number(trade.data?.token_amount) || 0);
            return (
              <div key={trade.id} className="recent-trades__row">
                <div className={`recent-trades__dot recent-trades__dot--${isBuy ? "buy" : "sell"}`} />
                {trade.wallet_address && (
                  <Image
                    src={generateIdenticon(trade.wallet_address)}
                    alt=""
                    width={20}
                    height={20}
                    style={{ flexShrink: 0 }}
                  />
                )}
                <span className="recent-trades__wallet">
                  {trade.wallet_address ? getDefaultDisplayName(trade.wallet_address) : "???"}
                </span>
                <span style={{ color: isBuy ? "#22c55e" : "#ef4444", fontWeight: 800 }}>
                  {isBuy ? "bought" : "sold"}
                </span>
                <span className="recent-trades__amount">{tokens}</span>
                <span className="recent-trades__time">{timeAgo(trade.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

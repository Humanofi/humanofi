// ========================================
// Humanofi — Trade Signal Group
// ========================================
// Compact display of 2-3 trades grouped together
// to prevent trade events from drowning out posts.

import Link from "next/link";
import type { FeedEventData } from "./FeedEventCard";

interface TradeSignalGroupProps {
  trades: FeedEventData[];
}

function formatSolShort(lamports: number): string {
  const sol = lamports / 1e9;
  if (sol >= 1) return `${sol.toFixed(2)} SOL`;
  if (sol >= 0.01) return `${sol.toFixed(3)} SOL`;
  return `${sol.toFixed(4)} SOL`;
}

function shortWallet(addr?: string | null): string {
  if (!addr) return "???";
  return `${addr.slice(0, 4)}..${addr.slice(-3)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function TradeSignalGroup({ trades }: TradeSignalGroupProps) {
  if (trades.length === 0) return null;

  return (
    <div className="trade-signal-group">
      {trades.map((t) => {
        const d = (t.data || {}) as Record<string, unknown>;
        const isBuy = (d.trade_type as string) === "buy";
        const sol = formatSolShort(Number(d.sol_amount) || 0);
        const name = t.creator_tokens?.display_name || "???";
        const wallet = shortWallet(t.wallet_address);

        return (
          <Link
            key={t.id}
            href={`/person/${t.mint_address}`}
            className="trade-signal-group__item"
            style={{ textDecoration: "none" }}
          >
            <span className={`trade-signal-group__dot ${isBuy ? "trade-signal-group__dot--buy" : "trade-signal-group__dot--sell"}`} />
            <span className="trade-signal-group__text">
              <span className="trade-signal-group__wallet">{wallet}</span>
              {" "}
              <span style={{ color: isBuy ? "#22c55e" : "#ef4444", fontWeight: 800 }}>
                {isBuy ? "bought" : "sold"}
              </span>
              {" "}
              <span style={{ fontWeight: 800 }}>{sol}</span>
              {" → "}
              <span style={{ fontWeight: 900 }}>${name}</span>
            </span>
            <span className="trade-signal-group__time">{timeAgo(t.created_at)}</span>
          </Link>
        );
      })}
    </div>
  );
}

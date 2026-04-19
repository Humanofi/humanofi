"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Crown, Star, Medal } from "@phosphor-icons/react";

interface Holder {
  wallet_address: string;
  balance: number;
  rank: number;
  is_early_believer: boolean;
  display_name: string;
  avatar_url: string | null;
}

interface TopBelieversProps {
  mintAddress: string;
}

function formatTokens(balance: number): string {
  const tokens = balance / 1e6;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toFixed(0);
}

const RANK_ICONS = [
  <Crown key="1" size={18} weight="fill" />,
  <Medal key="2" size={16} weight="fill" />,
  <Medal key="3" size={16} weight="fill" />,
];

export default function TopBelievers({ mintAddress }: TopBelieversProps) {
  const [holders, setHolders] = useState<Holder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mintAddress) return;
    fetch(`/api/holders/${mintAddress}?limit=3`)
      .then((r) => r.json())
      .then((data) => {
        setHolders(data.holders || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [mintAddress]);

  if (loading) return null;

  return (
    <div className="top-believers">
      <div className="top-believers__header">
        <Crown size={16} weight="bold" style={{ color: "#f59e0b" }} />
        Top Believers
      </div>

      {holders.length === 0 ? (
        <div className="top-believers__empty">
          No holders yet. Be the first to believe.
        </div>
      ) : (
        <div className="top-believers__list">
          {holders.map((holder, i) => (
            <div key={holder.wallet_address} className="top-believers__row">
              <div className={`top-believers__rank top-believers__rank--${i + 1}`}>
                {RANK_ICONS[i] || `#${i + 1}`}
              </div>
              <Image
                src={holder.avatar_url || "/default-avatar.png"}
                alt={holder.display_name}
                width={36}
                height={36}
                className="top-believers__avatar"
              />
              <div className="top-believers__info">
                <div className="top-believers__name">{holder.display_name}</div>
                <div className="top-believers__balance">
                  {formatTokens(holder.balance)} tokens
                </div>
              </div>
              <div className="top-believers__badges">
                {holder.is_early_believer && (
                  <span className="top-believers__early-badge">
                    <Star size={10} weight="fill" /> Early
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

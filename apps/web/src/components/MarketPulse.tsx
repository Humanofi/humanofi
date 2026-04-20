// ========================================
// Humanofi — Market Pulse Widget
// ========================================
// Shows live market stats at the top of the feed.
// Gives instant context: "this is a market, not a social network"
// Uses dedicated /api/market-pulse for accurate server-side aggregation.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Lightning, TrendUp, Coins, Users, Fire } from "@phosphor-icons/react";

interface MarketStats {
  totalTrades24h: number;
  totalVolume24h: number; // in SOL
  topCreator: {
    mint_address: string;
    display_name: string;
    avatar_url: string | null;
    tradeCount: number;
  } | null;
  activeCreators: number;
}

export default function MarketPulse() {
  const [stats, setStats] = useState<MarketStats | null>(null);

  useEffect(() => {
    async function fetchPulse() {
      try {
        const res = await fetch("/api/market-pulse");
        if (!res.ok) return;
        const data = await res.json();
        setStats(data);
      } catch {
        /* silent */
      }
    }

    fetchPulse();
    const interval = setInterval(fetchPulse, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  if (!stats || stats.totalTrades24h === 0) return null;

  return (
    <div className="market-pulse">
      <div className="market-pulse__header">
        <Lightning size={14} weight="fill" />
        <span>Market Pulse</span>
        <span className="market-pulse__live">LIVE</span>
      </div>
      <div className="market-pulse__stats">
        <div className="market-pulse__stat">
          <Coins size={14} weight="bold" />
          <span className="market-pulse__stat-value">
            {stats.totalVolume24h.toFixed(2)} SOL
          </span>
          <span className="market-pulse__stat-label">volume 24h</span>
        </div>
        <div className="market-pulse__stat">
          <TrendUp size={14} weight="bold" />
          <span className="market-pulse__stat-value">{stats.totalTrades24h}</span>
          <span className="market-pulse__stat-label">trades</span>
        </div>
        <div className="market-pulse__stat">
          <Users size={14} weight="bold" />
          <span className="market-pulse__stat-value">{stats.activeCreators}</span>
          <span className="market-pulse__stat-label">active tokens</span>
        </div>
        {stats.topCreator && (
          <Link
            href={`/person/${stats.topCreator.mint_address}`}
            className="market-pulse__top"
          >
            <Image
              src={stats.topCreator.avatar_url || "/default-avatar.png"}
              alt={stats.topCreator.display_name}
              width={22}
              height={22}
              className="market-pulse__top-avatar"
            />
            <span className="market-pulse__top-name">
              ${stats.topCreator.display_name}
            </span>
            <span className="market-pulse__top-label"><Fire size={12} weight="fill" style={{ display: 'inline', verticalAlign: 'middle', marginTop: -2 }} /> trending</span>
          </Link>
        )}
      </div>
    </div>
  );
}

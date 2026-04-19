// ========================================
// Humanofi — Market Pulse Widget
// ========================================
// Shows live market stats at the top of the feed.
// Gives instant context: "this is a market, not a social network"

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Lightning, TrendUp, Coins, Users } from "@phosphor-icons/react";

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
        const res = await fetch("/api/feed-events?limit=50&type=trade");
        if (!res.ok) return;
        const data = await res.json();
        const events = data.events || [];

        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;

        // Filter to last 24h
        const recent = events.filter(
          (e: Record<string, unknown>) =>
            new Date(e.created_at as string).getTime() > oneDayAgo
        );

        // Total trades & volume
        let totalVol = 0;
        const creatorMap: Record<string, { count: number; name: string; avatar: string | null; mint: string }> = {};

        recent.forEach((e: Record<string, unknown>) => {
          const d = (e.data || {}) as Record<string, unknown>;
          totalVol += Number(d.sol_amount || 0) / 1e9;

          const ct = e.creator_tokens as Record<string, unknown> | undefined;
          const mint = e.mint_address as string;
          if (!creatorMap[mint]) {
            creatorMap[mint] = {
              count: 0,
              name: (ct?.display_name as string) || "Unknown",
              avatar: (ct?.avatar_url as string | null) || null,
              mint,
            };
          }
          creatorMap[mint].count++;
        });

        // Top creator by trade count
        const sorted = Object.values(creatorMap).sort((a, b) => b.count - a.count);
        const top = sorted[0] || null;

        setStats({
          totalTrades24h: recent.length,
          totalVolume24h: totalVol,
          topCreator: top
            ? {
                mint_address: top.mint,
                display_name: top.name,
                avatar_url: top.avatar,
                tradeCount: top.count,
              }
            : null,
          activeCreators: Object.keys(creatorMap).length,
        });
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
            <span className="market-pulse__top-label">🔥 trending</span>
          </Link>
        )}
      </div>
    </div>
  );
}

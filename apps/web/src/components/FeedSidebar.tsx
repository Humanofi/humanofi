// ========================================
// Humanofi — Feed Sidebar
// ========================================
// Sticky sidebar for the unified feed homepage.
// 3 sections: Top Humans, Just Launched, Your Ranks.

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { TrendUp, Rocket, Crown } from "@phosphor-icons/react";

interface SidebarCreator {
  mint_address: string;
  display_name: string;
  avatar_url: string | null;
  category: string;
  holder_count?: number;
}

interface HolderRank {
  mint: string;
  name: string;
  rank: number;
  total: number;
  is_early_believer: boolean;
}

interface FeedSidebarProps {
  walletAddress: string | null;
  authenticated: boolean;
}

export default function FeedSidebar({ walletAddress, authenticated }: FeedSidebarProps) {
  const [topMovers, setTopMovers] = useState<SidebarCreator[]>([]);
  const [recentCreators, setRecentCreators] = useState<SidebarCreator[]>([]);
  const [holderRanks, setHolderRanks] = useState<HolderRank[]>([]);

  // Fetch sidebar data
  useEffect(() => {
    fetch("/api/creators?limit=5&sort=holder_count")
      .then(r => r.json())
      .then(data => setTopMovers(data.creators || []))
      .catch(() => {});

    fetch("/api/creators?limit=3&sort=created_at")
      .then(r => r.json())
      .then(data => setRecentCreators(data.creators || []))
      .catch(() => {});
  }, []);

  // Fetch user's holder ranks
  useEffect(() => {
    if (!walletAddress || !authenticated) return;

    const fetchRanks = async () => {
      try {
        // Get user's positions
        const res = await fetch(`/api/portfolio?wallet=${walletAddress}`);
        if (!res.ok) return;
        const data = await res.json();
        const positions = data.positions || [];

        // Fetch rank for each position
        const ranks: HolderRank[] = [];
        await Promise.all(
          positions.slice(0, 5).map(async (pos: { mint_address: string; display_name: string }) => {
            try {
              const r = await fetch(`/api/holders/${pos.mint_address}?limit=1&wallet=${walletAddress}`);
              if (r.ok) {
                const d = await r.json();
                if (d.myRank) {
                  ranks.push({
                    mint: pos.mint_address,
                    name: pos.display_name,
                    rank: d.myRank.rank,
                    total: d.totalHolders || 0,
                    is_early_believer: d.myRank.is_early_believer,
                  });
                }
              }
            } catch { /* ignore */ }
          })
        );
        setHolderRanks(ranks.sort((a, b) => a.rank - b.rank));
      } catch { /* ignore */ }
    };

    fetchRanks();
  }, [walletAddress, authenticated]);

  return (
    <div className="feed-sidebar">
      {/* Top Humans */}
      <div className="feed-sidebar__section">
        <div className="feed-sidebar__header">
          <TrendUp size={18} weight="bold" color="#22c55e" />
          <h2 className="feed-sidebar__title">Top Humans</h2>
        </div>
        <div className="feed-sidebar__list">
          {topMovers.map((c, i) => (
            <Link key={c.mint_address} href={`/person/${c.mint_address}`} className="feed-sidebar__item">
              <span className="feed-sidebar__rank" style={{ color: i === 0 ? "#f59e0b" : "var(--text-muted)" }}>
                #{i + 1}
              </span>
              <Image
                src={c.avatar_url || "/default-avatar.png"}
                alt={c.display_name}
                width={28}
                height={28}
                className="feed-sidebar__avatar"
              />
              <div className="feed-sidebar__item-info">
                <div className="feed-sidebar__item-name">{c.display_name}</div>
                <div className="feed-sidebar__item-meta">{c.holder_count || 0} holders</div>
              </div>
            </Link>
          ))}
          <Link href="/explore" className="feed-sidebar__see-all">
            See all →
          </Link>
        </div>
      </div>

      {/* Just Launched */}
      <div className="feed-sidebar__section feed-sidebar__section--alt">
        <div className="feed-sidebar__header">
          <Rocket size={18} weight="bold" color="var(--accent)" />
          <h2 className="feed-sidebar__title">Just Launched</h2>
        </div>
        <div className="feed-sidebar__list">
          {recentCreators.map((c) => (
            <Link key={c.mint_address} href={`/person/${c.mint_address}`} className="feed-sidebar__item">
              <Image
                src={c.avatar_url || "/default-avatar.png"}
                alt={c.display_name}
                width={28}
                height={28}
                className="feed-sidebar__avatar"
              />
              <div className="feed-sidebar__item-info">
                <div className="feed-sidebar__item-name">{c.display_name}</div>
                <div className="feed-sidebar__item-meta">{c.category}</div>
              </div>
              <span className="feed-sidebar__new-badge">New</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Your Ranks */}
      {authenticated && holderRanks.length > 0 && (
        <div className="feed-sidebar__section">
          <div className="feed-sidebar__header">
            <Crown size={18} weight="bold" color="#f59e0b" />
            <h2 className="feed-sidebar__title">Your Ranks</h2>
          </div>
          <div className="feed-sidebar__list">
            {holderRanks.map((r) => (
              <Link key={r.mint} href={`/person/${r.mint}`} className="feed-sidebar__item">
                <span className={`feed-sidebar__rank ${r.rank <= 3 ? "feed-sidebar__rank--top" : ""}`}>
                  {r.rank <= 3 ? "👑" : "🏅"} #{r.rank}
                </span>
                <div className="feed-sidebar__item-info">
                  <div className="feed-sidebar__item-name">${r.name}</div>
                  <div className="feed-sidebar__item-meta">
                    out of {r.total}
                    {r.is_early_believer && <span className="feed-sidebar__early"> ⭐ Early</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ========================================
// Humanofi — Feed Sidebar (Smart Refresh V2)
// ========================================
// Sticky sidebar for the unified feed homepage.
// 3 sections: Top Humans, Just Launched, Your Ranks.
// Smart refresh: polling every 60s + external trigger via refreshKey prop.

"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { TrendUp, RocketLaunch, Crown, Medal, Star } from "@phosphor-icons/react";

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
  /** Increment this to force a sidebar data refresh (e.g. on realtime events) */
  refreshKey?: number;
}

const POLLING_INTERVAL = 60_000; // 60 seconds

export default function FeedSidebar({ walletAddress, authenticated, refreshKey = 0 }: FeedSidebarProps) {
  const [topMovers, setTopMovers] = useState<SidebarCreator[]>([]);
  const [recentCreators, setRecentCreators] = useState<SidebarCreator[]>([]);
  const [holderRanks, setHolderRanks] = useState<HolderRank[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch sidebar data (Top Humans + Just Launched) ──
  const fetchSidebarData = () => {
    fetch("/api/creators?limit=5&sort=holder_count")
      .then(r => r.json())
      .then(data => setTopMovers(data.creators || []))
      .catch(() => {});

    fetch("/api/creators?limit=3&sort=created_at")
      .then(r => r.json())
      .then(data => setRecentCreators(data.creators || []))
      .catch(() => {});
  };

  // ── Fetch user's holder ranks ──
  const fetchRanks = () => {
    if (!walletAddress || !authenticated) return;
    fetch(`/api/holder-ranks?wallet=${walletAddress}`)
      .then(r => r.json())
      .then(data => setHolderRanks((data.ranks || []).sort((a: HolderRank, b: HolderRank) => a.rank - b.rank)))
      .catch(() => {});
  };

  // Initial fetch + smart polling
  useEffect(() => {
    fetchSidebarData();

    // Smart polling every 60s
    intervalRef.current = setInterval(fetchSidebarData, POLLING_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Re-fetch when refreshKey changes (triggered by realtime events)
  useEffect(() => {
    if (refreshKey > 0) {
      fetchSidebarData();
      fetchRanks();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Fetch ranks on auth change
  useEffect(() => {
    fetchRanks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
              <span className="feed-sidebar__rank" style={{ color: i === 0 ? "var(--accent)" : "var(--text-muted)" }}>
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
          <RocketLaunch size={18} weight="bold" color="var(--accent)" />
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
            <Crown size={18} weight="bold" color="var(--accent)" />
            <h2 className="feed-sidebar__title">Your Ranks</h2>
          </div>
          <div className="feed-sidebar__list">
            {holderRanks.map((r) => (
              <Link key={r.mint} href={`/person/${r.mint}`} className="feed-sidebar__item">
                <span className={`feed-sidebar__rank ${r.rank <= 3 ? "feed-sidebar__rank--top" : ""}`}>
                  {r.rank <= 3
                    ? <Crown size={14} weight="fill" color="var(--accent)" style={{ verticalAlign: "middle" }} />
                    : <Medal size={14} weight="fill" color="var(--text-muted)" style={{ verticalAlign: "middle" }} />
                  } #{r.rank}
                </span>
                <div className="feed-sidebar__item-info">
                  <div className="feed-sidebar__item-name">${r.name}</div>
                  <div className="feed-sidebar__item-meta">
                    out of {r.total}
                    {r.is_early_believer && (
                      <span className="feed-sidebar__early">
                        <Star size={10} weight="fill" style={{ verticalAlign: "middle", marginRight: 2 }} /> Early
                      </span>
                    )}
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

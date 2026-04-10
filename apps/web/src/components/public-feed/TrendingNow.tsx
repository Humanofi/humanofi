"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Fire, ArrowRight } from "@phosphor-icons/react";

interface TrendingPost {
  id: string;
  creator_mint: string;
  content: string;
  reaction_count: number;
  hot_score: number;
  created_at: string;
  creator_tokens: {
    display_name: string;
    avatar_url: string | null;
    category: string;
  };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function TrendingNow() {
  const [posts, setPosts] = useState<TrendingPost[]>([]);

  useEffect(() => {
    fetch("/api/public-posts?limit=3")
      .then((r) => r.json())
      .then((data) => setPosts((data.posts || []).slice(0, 3)))
      .catch(() => {});
  }, []);

  if (posts.length === 0) return null;

  return (
    <section className="trending-section">
      <div className="trending-section__header">
        <h2 className="trending-section__title">
          <Fire size={20} weight="fill" /> Trending Now
        </h2>
        <Link href="/feed" className="trending-section__see-all">
          See all <ArrowRight size={14} />
        </Link>
      </div>

      <div className="trending-grid">
        {posts.map((post, i) => (
          <Link
            key={post.id}
            href="/feed"
            className="trending-card"
          >
            <div className="trending-card__rank">#{i + 1}</div>
            <div className="trending-card__creator">
              <Image
                src={post.creator_tokens.avatar_url || "/default-avatar.png"}
                alt={post.creator_tokens.display_name}
                width={28} height={28}
                style={{ borderRadius: "50%", objectFit: "cover" }}
              />
              <div>
                <div className="trending-card__name">{post.creator_tokens.display_name}</div>
                <div className="trending-card__time">{timeAgo(post.created_at)}</div>
              </div>
            </div>
            <p className="trending-card__content">
              {post.content.length > 120 ? post.content.slice(0, 120) + "..." : post.content}
            </p>
            <div className="trending-card__footer">
              <span className="trending-card__reactions">🔥 {post.reaction_count}</span>
              <span className="trending-card__category">{post.creator_tokens.category}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

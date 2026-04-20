"use client";

import { useState, useEffect, useCallback } from "react";
import { usePerson } from "../PersonLayout";
import PublicPostCard from "@/components/public-feed/PublicPostCard";
import type { PublicPost } from "@/components/public-feed/PublicPostCard";
import { useHumanofi } from "@/hooks/useHumanofi";

export default function PersonPublicPostsPage() {
  const { creator, mockPerson } = usePerson();
  const { walletAddress } = useHumanofi();
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [loading, setLoading] = useState(true);

  const creatorMint = creator?.mint_address;
  const displayName = creator?.display_name || mockPerson?.name || "Unknown";

  useEffect(() => {
    if (!creatorMint) {
      setLoading(false);
      return;
    }

    const fetchPosts = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/public-posts?creator_mint=${creatorMint}`);
        if (res.ok) {
          const data = await res.json();
          setPosts(data.posts || []);
        }
      } catch (err) {
        console.warn("Failed to fetch public posts:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [creatorMint]);

  const handleReactionChange = useCallback((postId: string, reactions: Record<string, number>, userReactions: string[]) => {
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, reactions, user_reactions: userReactions } : p
    ));
  }, []);

  if (!creator) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-muted)" }}>
          This is a demo profile. Public posts are only available for real creators.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center" }}>
        <div style={{ fontSize: "1rem", fontWeight: 800 }}>Loading posts...</div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-muted)" }}>
          {displayName} hasn&apos;t posted publicly yet.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", paddingBottom: 48 }}>
      <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: 24, borderBottom: "2px solid var(--border)", paddingBottom: 12 }}>
        Public Posts by {displayName}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {posts.map(post => (
          <PublicPostCard
            key={post.id}
            post={post}
            isOwner={false}
            walletAddress={walletAddress || undefined}
            onReactionChange={handleReactionChange}
          />
        ))}
      </div>
    </div>
  );
}

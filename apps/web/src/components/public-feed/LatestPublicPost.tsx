"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Megaphone, Fire } from "@phosphor-icons/react";

interface LatestPost {
  id: string;
  content: string;
  reaction_count: number;
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

export default function LatestPublicPost({ creatorMint }: { creatorMint: string }) {
  const [post, setPost] = useState<LatestPost | null>(null);

  useEffect(() => {
    fetch(`/api/public-posts?creator=${creatorMint}&limit=1`)
      .then((r) => r.json())
      .then((data) => {
        if (data.posts?.length > 0) setPost(data.posts[0]);
      })
      .catch(() => {});
  }, [creatorMint]);

  if (!post) return null;

  return (
    <section className="latest-public-post">
      <div className="latest-public-post__header">
        <Megaphone size={16} weight="bold" />
        <span>Latest Public Update</span>
        <span className="latest-public-post__time">{timeAgo(post.created_at)}</span>
      </div>
      <p className="latest-public-post__content">{post.content}</p>
      {post.reaction_count > 0 && (
        <div className="latest-public-post__reactions"><Fire size={14} weight="fill" /> {post.reaction_count} reactions</div>
      )}
    </section>
  );
}

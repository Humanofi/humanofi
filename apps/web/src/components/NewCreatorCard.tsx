// ========================================
// Humanofi — New Creator Discovery Card
// ========================================
// Shows a "just launched" creator in the feed as a rich discovery card
// with photo, name, category, bio excerpt, and CTA.

import Link from "next/link";
import Image from "next/image";
import { RocketLaunch } from "@phosphor-icons/react";
import type { FeedEventData } from "./FeedEventCard";

interface NewCreatorCardProps {
  event: FeedEventData;
}

export default function NewCreatorCard({ event }: NewCreatorCardProps) {
  const creator = event.creator_tokens;
  const name = creator?.display_name || "Unknown";
  const avatar = creator?.avatar_url || "/default-avatar.png";
  const category = creator?.category || "Creator";

  const timeAgo = (() => {
    const diff = Date.now() - new Date(event.created_at).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  })();

  return (
    <Link
      href={`/person/${event.mint_address}`}
      className="new-creator-card"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="new-creator-card__badge">
        <RocketLaunch size={12} weight="bold" style={{ display: "inline", verticalAlign: "middle", marginRight: 4, marginTop: -2 }} />
        NEW HUMAN
      </div>
      <div className="new-creator-card__inner">
        <div className="new-creator-card__avatar">
          <Image
            src={avatar}
            alt={name}
            width={56}
            height={56}
            style={{ objectFit: "cover", width: "100%", height: "100%" }}
          />
        </div>
        <div className="new-creator-card__info">
          <div className="new-creator-card__name">{name}</div>
          <div className="new-creator-card__category">{category}</div>
        </div>
        <div className="new-creator-card__cta">
          Check it out →
        </div>
      </div>
      <div className="new-creator-card__time">{timeAgo}</div>
    </Link>
  );
}

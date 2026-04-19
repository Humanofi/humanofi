"use client";

import type { OnlineUser } from "@/hooks/useRealtimeChannel";
import { ChartBar, CalendarBlank } from "@phosphor-icons/react";

interface PresenceSidebarProps {
  onlineCount: number;
  onlineUsers: OnlineUser[];
  nextEvent?: { title: string; date: string } | null;
  isLive?: boolean;
  onJoinLive?: () => void;
  stats24h?: { reactions: number; posts: number };
}

export default function PresenceSidebar({
  onlineCount,
  onlineUsers,
  nextEvent,
  isLive,
  onJoinLive,
  stats24h,
}: PresenceSidebarProps) {
  return (
    <div className="ic-sidebar">
      {/* Online now */}
      <div className="ic-sidebar__section">
        <div className="ic-sidebar__section-title">
          <span className="ic-sidebar__dot ic-sidebar__dot--online" />
          {onlineCount} Online Now
        </div>
        <div className="ic-sidebar__users">
          {onlineUsers.slice(0, 8).map((u) => (
            <div key={u.wallet_address} className="ic-sidebar__user" title={u.wallet_address}>
              {u.wallet_address.slice(0, 4)}…{u.wallet_address.slice(-4)}
            </div>
          ))}
          {onlineCount > 8 && (
            <div className="ic-sidebar__user ic-sidebar__user--more">
              +{onlineCount - 8} more
            </div>
          )}
        </div>
      </div>

      {/* 24h Stats */}
      {stats24h && (
        <div className="ic-sidebar__section">
          <div className="ic-sidebar__section-title"><ChartBar size={14} weight="bold" /> Last 24h</div>
          <div className="ic-sidebar__stats-grid">

            <div className="ic-sidebar__stat">
              <span className="ic-sidebar__stat-val">{stats24h.reactions}</span>
              <span className="ic-sidebar__stat-lbl">Reactions</span>
            </div>
            <div className="ic-sidebar__stat">
              <span className="ic-sidebar__stat-val">{stats24h.posts}</span>
              <span className="ic-sidebar__stat-lbl">Posts</span>
            </div>
          </div>
        </div>
      )}

      {/* Live indicator */}
      {isLive && (
        <div className="ic-sidebar__section ic-sidebar__section--live">
          <div className="ic-sidebar__live-badge">
            <span className="ic-sidebar__dot ic-sidebar__dot--live" />
            LIVE NOW
          </div>
          <button className="btn-solid ic-sidebar__join-btn" onClick={onJoinLive}>
            Join Webinar →
          </button>
        </div>
      )}

      {/* Next event */}
      {nextEvent && (
        <div className="ic-sidebar__section">
          <div className="ic-sidebar__section-title"><CalendarBlank size={14} weight="bold" /> Next Event</div>
          <div className="ic-sidebar__event-title">{nextEvent.title}</div>
          <div className="ic-sidebar__event-date">
            {new Date(nextEvent.date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      )}
    </div>
  );
}

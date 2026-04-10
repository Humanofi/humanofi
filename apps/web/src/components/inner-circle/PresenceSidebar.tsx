"use client";

import { BADGE_LABELS } from "@/hooks/useStreak";
import type { StreakData } from "@/hooks/useStreak";
import type { OnlineUser } from "@/hooks/useRealtimeChannel";

interface PresenceSidebarProps {
  onlineCount: number;
  onlineUsers: OnlineUser[];
  streak: StreakData;
  nextEvent?: { title: string; date: string } | null;
  isLive?: boolean;
  onJoinLive?: () => void;
}

export default function PresenceSidebar({
  onlineCount,
  onlineUsers,
  streak,
  nextEvent,
  isLive,
  onJoinLive,
}: PresenceSidebarProps) {
  const badgeInfo = BADGE_LABELS[streak.badge] || BADGE_LABELS.none;

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
          <div className="ic-sidebar__section-title">📅 Next Event</div>
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

      {/* Streak */}
      <div className="ic-sidebar__section">
        <div className="ic-sidebar__section-title">🔥 Your Streak</div>
        <div className="ic-sidebar__streak">
          <div className="ic-sidebar__streak-count">
            {streak.currentStreak} day{streak.currentStreak !== 1 ? "s" : ""}
          </div>
          {streak.isActiveToday && (
            <div className="ic-sidebar__streak-active">✓ Active today</div>
          )}
          {!streak.isActiveToday && streak.currentStreak > 0 && (
            <div className="ic-sidebar__streak-warning">⚠ React to keep your streak!</div>
          )}
        </div>
      </div>

      {/* Badge */}
      <div className="ic-sidebar__section">
        <div className="ic-sidebar__section-title">🏆 Your Badge</div>
        <div className="ic-sidebar__badge">
          <span className="ic-sidebar__badge-emoji">{badgeInfo.emoji}</span>
          <span className="ic-sidebar__badge-label">{badgeInfo.label}</span>
        </div>
        {streak.longestStreak > streak.currentStreak && (
          <div className="ic-sidebar__best">Best: {streak.longestStreak} days</div>
        )}
      </div>
    </div>
  );
}

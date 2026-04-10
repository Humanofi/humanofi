"use client";

import { motion } from "framer-motion";

interface EventCardProps {
  postId: string;
  title: string;
  description: string;
  eventDate: string; // ISO string
  rsvpCount: number;
  userRsvp: string | null; // 'going' | 'interested' | null
  onRsvp: (postId: string, status: string) => void;
}

function getCountdown(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Happening now!";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

export default function EventCard({
  postId,
  title,
  description,
  eventDate,
  rsvpCount,
  userRsvp,
  onRsvp,
}: EventCardProps) {
  const isPast = new Date(eventDate).getTime() < Date.now();
  const formattedDate = new Date(eventDate).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="ic-event">
      <div className="ic-event__header">
        <div className="ic-event__icon">📅</div>
        <div>
          <div className="ic-event__title">{title}</div>
          <div className="ic-event__date">{formattedDate}</div>
        </div>
        {!isPast && (
          <div className="ic-event__countdown">
            <span className="ic-event__countdown-label">Starts in</span>
            <span className="ic-event__countdown-value">{getCountdown(eventDate)}</span>
          </div>
        )}
      </div>

      {description && (
        <div className="ic-event__desc">{description}</div>
      )}

      <div className="ic-event__footer">
        <span className="ic-event__rsvp-count">
          {rsvpCount} {rsvpCount === 1 ? "person" : "people"} going
        </span>

        {!isPast && (
          <div className="ic-event__actions">
            <motion.button
              className={`ic-event__btn ${userRsvp === "going" ? "ic-event__btn--active" : ""}`}
              onClick={() => onRsvp(postId, "going")}
              whileTap={{ scale: 0.95 }}
            >
              ✓ Going
            </motion.button>
            <motion.button
              className={`ic-event__btn ${userRsvp === "interested" ? "ic-event__btn--active" : ""}`}
              onClick={() => onRsvp(postId, "interested")}
              whileTap={{ scale: 0.95 }}
            >
              ★ Interested
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
}

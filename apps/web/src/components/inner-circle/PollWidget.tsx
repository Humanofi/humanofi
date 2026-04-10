"use client";

import { motion } from "framer-motion";

interface PollOption {
  text: string;
  votes: number;
}

interface PollWidgetProps {
  postId: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  userVote: number | null; // null if not voted yet
  onVote: (postId: string, optionIndex: number) => void;
  endsAt?: string; // ISO date
}

export default function PollWidget({
  postId,
  question,
  options,
  totalVotes,
  userVote,
  onVote,
  endsAt,
}: PollWidgetProps) {
  const hasVoted = userVote !== null;
  const isExpired = endsAt ? new Date(endsAt) < new Date() : false;

  return (
    <div className="ic-poll">
      <div className="ic-poll__question">{question}</div>

      <div className="ic-poll__options">
        {options.map((opt, i) => {
          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
          const isSelected = userVote === i;

          return (
            <motion.button
              key={i}
              className={`ic-poll__option ${isSelected ? "ic-poll__option--selected" : ""} ${hasVoted ? "ic-poll__option--voted" : ""}`}
              onClick={() => !hasVoted && !isExpired && onVote(postId, i)}
              disabled={hasVoted || isExpired}
              whileTap={!hasVoted ? { scale: 0.98 } : undefined}
            >
              {/* Progress bar fill */}
              {hasVoted && (
                <motion.div
                  className="ic-poll__bar"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <span className="ic-poll__text">{opt.text}</span>
              {hasVoted && (
                <span className="ic-poll__pct">{pct}%</span>
              )}
              {isSelected && <span className="ic-poll__check">✓</span>}
            </motion.button>
          );
        })}
      </div>

      <div className="ic-poll__footer">
        <span>{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</span>
        {endsAt && !isExpired && (
          <span>Ends {new Date(endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        )}
        {isExpired && <span>Poll ended</span>}
      </div>
    </div>
  );
}

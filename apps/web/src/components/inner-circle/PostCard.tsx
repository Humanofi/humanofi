"use client";

import Image from "next/image";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PushPin, Megaphone, CalendarBlank, ChartBar, DotsThreeVertical, PencilSimple, Trash, YoutubeLogo, Question } from "@phosphor-icons/react";
import ReactionBar from "./ReactionBar";
import PollWidget from "./PollWidget";
import EventCard from "./EventCard";
import QAWidget from "./QAWidget";
import MediaPlayer from "./MediaPlayer";

export interface PostData {
  id: string;
  content: string;
  post_type: string;
  metadata: Record<string, any>;
  image_urls: string[];
  media_urls: string[];
  is_pinned: boolean;
  creator_mint: string;
  created_at: string;
  reactions: Record<string, number>;
  userReactions: string[];
  reply_count: number;
}

interface PostCardProps {
  post: PostData;
  creatorName: string;
  creatorAvatar: string;
  isCreator?: boolean;
  walletAddress?: string;
  onVote?: (postId: string, optionIndex: number) => void;
  onRsvp?: (postId: string, status: string) => void;
  onDelete?: (postId: string) => void;
  onReactionChange: (postId: string, reactions: Record<string, number>, userReactions: string[]) => void;
  userVotes?: Record<string, number>;
  userRsvps?: Record<string, string>;
}

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

const TYPE_ICONS: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  announcement: { icon: <Megaphone size={14} weight="bold" />, color: "#ffc800", label: "ANNOUNCEMENT" },
  youtube: { icon: <YoutubeLogo size={14} weight="bold" />, color: "#ff0000", label: "VIDEO" },
  question: { icon: <Question size={14} weight="bold" />, color: "#06b6d4", label: "AMA" },
  event: { icon: <CalendarBlank size={14} weight="bold" />, color: "var(--accent)", label: "EVENT" },
  poll: { icon: <ChartBar size={14} weight="bold" />, color: "#a855f7", label: "POLL" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PostCard({
  post,
  creatorName,
  creatorAvatar,
  isCreator = false,
  walletAddress,
  onVote,
  onRsvp,
  onDelete,
  onReactionChange,
  userVotes = {},
  userRsvps = {},
}: PostCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const allMedia = [...(post.image_urls || []), ...(post.media_urls || [])];
  const ytMatch = post.content.match(YOUTUBE_REGEX);
  const ytVideoId = (post.metadata as any)?.youtube_id || (ytMatch ? ytMatch[1] : null);

  // Separate media by type
  const images = allMedia.filter((u) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(u));
  const videos = allMedia.filter((u) => /\.(mp4|webm|mov)$/i.test(u));
  const audios = allMedia.filter((u) => /\.(mp3|wav|m4a|ogg)$/i.test(u) || u.includes("audio%2F"));
  const docs = allMedia.filter((u) => /\.(pdf|doc|docx)$/i.test(u));

  const typeInfo = TYPE_ICONS[post.post_type];

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/inner-circle/${post.creator_mint}/posts/${post.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDelete(post.id);
      }
    } catch {
      // silent
    } finally {
      setDeleting(false);
      setShowMenu(false);
    }
  };

  return (
    <motion.div
      className={`ic-post ${post.is_pinned ? "ic-post--pinned" : ""}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        borderLeft: typeInfo ? `3px solid ${typeInfo.color}` : undefined,
      }}
    >
      {/* Pinned */}
      {post.is_pinned && (
        <div className="ic-post__pin"><PushPin size={12} weight="fill" /> Pinned</div>
      )}

      {/* Header */}
      <div className="ic-post__header">
        <Image
          src={creatorAvatar || "/default-avatar.png"}
          alt={creatorName}
          width={36}
          height={36}
          className="ic-post__avatar"
        />
        <div className="ic-post__meta">
          <span className="ic-post__author">{creatorName}</span>
          <span className="ic-post__date">{timeAgo(post.created_at)}</span>
        </div>

        {typeInfo && (
          <span className="ic-post__badge" style={{ color: typeInfo.color }}>
            {typeInfo.icon}
            <span>{typeInfo.label}</span>
          </span>
        )}

        {/* Creator menu */}
        {isCreator && (
          <div className="ic-post__menu-wrapper">
            <button className="ic-post__menu-btn" onClick={() => setShowMenu(!showMenu)}>
              <DotsThreeVertical size={18} weight="bold" />
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  className="ic-post__menu"
                  initial={{ opacity: 0, scale: 0.9, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <button className="ic-post__menu-item" onClick={handleDelete} disabled={deleting}>
                    <Trash size={14} /> {deleting ? "Deleting..." : "Delete"}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Content */}
      {post.content && post.content !== "Shared media" && (
        <div className="ic-post__content">{post.content}</div>
      )}

      {/* YouTube embed */}
      {ytVideoId && (
        <div className="ic-post__youtube">
          <iframe
            width="100%"
            height="315"
            src={`https://www.youtube.com/embed/${ytVideoId}`}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {/* Images grid */}
      {images.length > 0 && (
        <div className={`ic-post__media ic-post__media--${Math.min(images.length, 4)}`}>
          {images.slice(0, 4).map((url, i) => (
            <div key={i} className="ic-post__media-item">
              <MediaPlayer url={url} />
              {i === 3 && images.length > 4 && (
                <div className="ic-post__media-more">+{images.length - 4}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Videos */}
      {videos.map((url, i) => (
        <div key={`v-${i}`} className="ic-post__video-wrap">
          <video src={url} controls preload="metadata" />
        </div>
      ))}

      {/* Audio Players */}
      {audios.map((url, i) => (
        <div key={`a-${i}`} className="ic-post__audio-wrap">
          <div className="ic-post__audio-icon">🎙️</div>
          <div className="ic-post__audio-player">
            <div className="ic-post__audio-label">Voice Memo</div>
            <audio src={url} controls />
          </div>
        </div>
      ))}

      {/* Documents */}
      {docs.map((url, i) => (
        <a key={`d-${i}`} href={url} target="_blank" rel="noopener noreferrer" className="ic-post__doc">
          <span className="ic-post__doc-icon">📄</span>
          <div className="ic-post__doc-info">
            <span className="ic-post__doc-name">Document</span>
            <span className="ic-post__doc-action">Open →</span>
          </div>
        </a>
      ))}

      {/* Poll */}
      {post.post_type === "poll" && post.metadata?.options && onVote && (
        <PollWidget
          postId={post.id}
          question={post.content}
          options={(post.metadata.options as string[]).map((text: string, i: number) => ({
            text,
            votes: (post.metadata.votes as number[])?.[i] || 0,
          }))}
          totalVotes={((post.metadata.votes as number[]) || []).reduce((a: number, b: number) => a + b, 0)}
          userVote={userVotes[post.id] ?? null}
          onVote={onVote}
          endsAt={post.metadata.ends_at as string}
        />
      )}

      {/* Event */}
      {post.post_type === "event" && post.metadata?.event_date && onRsvp && (
        <EventCard
          postId={post.id}
          title={post.metadata.event_title as string || post.content}
          description={post.metadata.event_description as string || ""}
          eventDate={post.metadata.event_date as string}
          rsvpCount={post.metadata.rsvp_count as number || 0}
          userRsvp={userRsvps[post.id] ?? null}
          onRsvp={onRsvp}
        />
      )}

      {/* Question / AMA */}
      {post.post_type === "question" && walletAddress && (
        <QAWidget
          postId={post.id}
          mintAddress={post.creator_mint}
          walletAddress={walletAddress}
          isCreator={isCreator || false}
        />
      )}

      {/* Reactions */}
      <ReactionBar
        postId={post.id}
        mintAddress={post.creator_mint}
        walletAddress={walletAddress || ""}
        reactions={post.reactions || {}}
        userReactions={post.userReactions || []}
        onReactionChange={onReactionChange}
      />
    </motion.div>
  );
}

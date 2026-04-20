"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash, DotsThreeVertical, Users, PencilSimple, FloppyDisk, X } from "@phosphor-icons/react";
import MediaPlayer from "../inner-circle/MediaPlayer";
import { toast } from "sonner";
import { useAuthFetch } from "@/lib/authFetch";

const REACTIONS = [
  { emoji: "🔥", label: "Fire" },
  { emoji: "💡", label: "Insightful" },
  { emoji: "🙏", label: "Thanks" },
  { emoji: "🚀", label: "Let's go" },
  { emoji: "❤️", label: "Love" },
  { emoji: "👀", label: "Watching" },
  { emoji: "😅", label: "Sweat" },
  { emoji: "😫", label: "Exhausted" },
  { emoji: "😱", label: "Shocked" },
  { emoji: "🤌", label: "Chef's kiss" },
];

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export interface PublicPost {
  id: string;
  creator_mint: string;
  content: string;
  media_urls: string[];
  created_at: string;
  reaction_count: number;
  hot_score: number;
  reactions: Record<string, number>;
  userReactions: string[];
  holderCount: number;
  creator_tokens: {
    display_name: string;
    avatar_url: string | null;
    category: string;
  };
}

interface PublicPostCardProps {
  post: PublicPost;
  isOwner?: boolean;
  walletAddress?: string;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<PublicPost>) => void;
  onReactionChange: (postId: string, reactions: Record<string, number>, userReactions: string[]) => void;
}

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

export default function PublicPostCard({
  post,
  isOwner = false,
  walletAddress,
  onDelete,
  onUpdate,
  onReactionChange,
}: PublicPostCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [saving, setSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const authFetch = useAuthFetch();

  const ytMatch = post.content.match(YOUTUBE_REGEX);
  const ytVideoId = ytMatch ? ytMatch[1] : null;
  const images = (post.media_urls || []).filter((u) => /\.(jpg|jpeg|png|gif|webp)$/i.test(u));
  const totalReactions = Object.values(post.reactions).reduce((a, b) => a + b, 0);
  const activeEmojis = REACTIONS.filter((r) => (post.reactions[r.emoji] || 0) > 0);

  // Content truncation
  const TRUNCATE_LENGTH = 280;
  const shouldTruncate = post.content.length > TRUNCATE_LENGTH;
  const displayContent = shouldTruncate && !isExpanded 
    ? post.content.slice(0, TRUNCATE_LENGTH) + "..." 
    : post.content;

  const handleReact = useCallback(async (emoji: string) => {
    if (!walletAddress) { toast.error("Connect wallet to react"); return; }
    if (loading) return;
    setLoading(emoji);
    setShowPicker(false);

    // ── Optimistic update: update UI IMMEDIATELY ──
    const prevReactions = { ...post.reactions };
    const prevUserReactions = [...post.userReactions];
    const hasExisting = post.userReactions.length > 0;
    const isSameEmoji = post.userReactions.includes(emoji);

    const optimisticReactions = { ...post.reactions };
    let optimisticUserReactions: string[];

    if (isSameEmoji) {
      // Toggle OFF
      optimisticReactions[emoji] = Math.max(0, (optimisticReactions[emoji] || 0) - 1);
      if (optimisticReactions[emoji] === 0) delete optimisticReactions[emoji];
      optimisticUserReactions = [];
    } else if (hasExisting) {
      // Replace: decrement old, increment new
      const oldEmoji = post.userReactions[0];
      optimisticReactions[oldEmoji] = Math.max(0, (optimisticReactions[oldEmoji] || 0) - 1);
      if (optimisticReactions[oldEmoji] === 0) delete optimisticReactions[oldEmoji];
      optimisticReactions[emoji] = (optimisticReactions[emoji] || 0) + 1;
      optimisticUserReactions = [emoji];
    } else {
      // Add new
      optimisticReactions[emoji] = (optimisticReactions[emoji] || 0) + 1;
      optimisticUserReactions = [emoji];
    }

    // Apply optimistic state INSTANTLY
    onReactionChange(post.id, optimisticReactions, optimisticUserReactions);

    // ── Fire API call in background ──
    try {
      const res = await authFetch(`/api/public-posts/${post.id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) {
        // Rollback on error
        onReactionChange(post.id, prevReactions, prevUserReactions);
        toast.error("Failed to react");
      }
    } catch {
      // Rollback on network error
      onReactionChange(post.id, prevReactions, prevUserReactions);
      toast.error("Failed to react");
    } finally {
      setLoading(null);
    }
  }, [post, walletAddress, loading, onReactionChange, authFetch]);

  const handleDelete = async () => {
    if (!onDelete || !walletAddress) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/public-posts/${post.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDelete(post.id);
        toast.success("Post supprimé");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Échec de la suppression");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!onUpdate || !walletAddress || !editContent.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/public-posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (res.ok) {
        onUpdate(post.id, { content: editContent.trim() });
        setEditing(false);
        toast.success("Post modifié");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Échec de la modification");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="pub-post"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div className="pub-post__header">
        <Link href={`/person/${post.creator_mint}`} className="pub-post__creator">
          <Image
            src={post.creator_tokens.avatar_url || "/default-avatar.png"}
            alt={post.creator_tokens.display_name}
            width={40} height={40}
            className="pub-post__avatar"
          />
          <div className="pub-post__creator-info">
            <span className="pub-post__name">{post.creator_tokens.display_name}</span>
            <div className="pub-post__meta-row">
              <span className="pub-post__category">{post.creator_tokens.category}</span>
              <span className="pub-post__dot">·</span>
              <span className="pub-post__time">{timeAgo(post.created_at)}</span>
            </div>
          </div>
        </Link>

        <div className="pub-post__right">
          {post.holderCount > 0 && (
            <div className="pub-post__holder-stack" title={`${post.holderCount} holders`}>
              <div className="pub-post__holder-avatars">
                {Array.from({ length: Math.min(post.holderCount, 3) }).map((_, i) => {
                  const colors = ["#22c55e", "#f59e0b", "#3b82f6"];
                  return (
                    <div 
                      key={i} 
                      className="pub-post__holder-dot" 
                      style={{ backgroundColor: colors[i], zIndex: 10 - i }} 
                    />
                  );
                })}
              </div>
              <span>{post.holderCount} {post.holderCount === 1 ? 'Backer' : 'Backers'}</span>
            </div>
          )}

          {isOwner && (
            <div className="pub-post__menu-wrapper">
              <button className="pub-post__menu-btn" onClick={() => setShowMenu(!showMenu)}>
                <DotsThreeVertical size={18} weight="bold" />
              </button>
              <AnimatePresence>
                {showMenu && (
                  <motion.div className="pub-post__menu" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                    <button className="pub-post__menu-item" onClick={() => { setEditing(true); setEditContent(post.content); setShowMenu(false); }}>
                      <PencilSimple size={14} /> Edit
                    </button>
                    <button className="pub-post__menu-item pub-post__menu-item--danger" onClick={() => { setShowDeleteModal(true); setShowMenu(false); }}>
                      <Trash size={14} /> Delete
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Content — editable or static */}
      {editing ? (
        <div className="ic-post__edit">
          <textarea className="ic-post__edit-input" value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3} />
          <div className="ic-post__edit-actions">
            <button className="btn-solid ic-post__edit-save" onClick={handleSaveEdit} disabled={saving}>
              <FloppyDisk size={14} /> {saving ? "Saving..." : "Save"}
            </button>
            <button className="btn-outline ic-post__edit-cancel" onClick={() => { setEditing(false); setEditContent(post.content); }}>
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="pub-post__content-wrapper">
          <div className="pub-post__content">{displayContent}</div>
          {shouldTruncate && (
            <button 
              className="pub-post__read-more"
              onClick={(e) => {
                e.preventDefault();
                setIsExpanded(!isExpanded);
              }}
            >
              {isExpanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}

      {/* YouTube */}
      {ytVideoId && (
        <div className="pub-post__youtube">
          <iframe width="100%" height="280" src={`https://www.youtube.com/embed/${ytVideoId}`}
            title="YouTube" frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen />
        </div>
      )}

      {/* Images */}
      {images.length > 0 && (
        <div className={`pub-post__media pub-post__media--${Math.min(images.length, 3)}`}>
          {images.slice(0, 3).map((url, i) => (
            <div key={i} className="pub-post__media-item"><MediaPlayer url={url} /></div>
          ))}
        </div>
      )}


      {/* Reactions */}
      <div className="pub-post__reactions">
        {activeEmojis.map(({ emoji }) => {
          const count = post.reactions[emoji] || 0;
          const isOwn = post.userReactions.includes(emoji);
          return (
            <motion.button key={emoji}
              className={`ic-reactions__pill ${isOwn ? "ic-reactions__pill--own" : ""}`}
              onClick={() => handleReact(emoji)} whileTap={{ scale: 0.9 }}
              disabled={loading === emoji}
            >
              <span className="ic-reactions__emoji">{emoji}</span>
              <AnimatePresence mode="wait">
                <motion.span key={count} className="ic-reactions__count"
                  initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 6, opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >{count}</motion.span>
              </AnimatePresence>
            </motion.button>
          );
        })}

        <div className="ic-reactions__add-wrapper">
          <motion.button className="ic-reactions__add" onClick={() => setShowPicker(!showPicker)} whileTap={{ scale: 0.9 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="5.5" cy="6.5" r="1" fill="currentColor"/>
              <circle cx="10.5" cy="6.5" r="1" fill="currentColor"/>
              <path d="M5 10.5C5.5 11.5 6.5 12 8 12C9.5 12 10.5 11.5 11 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <span>+</span>
          </motion.button>
          <AnimatePresence>
            {showPicker && (
              <motion.div className="ic-reactions__picker"
                initial={{ opacity: 0, scale: 0.9, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 8 }}>
                {REACTIONS.map(({ emoji, label }) => (
                  <motion.button key={emoji}
                    className={`ic-reactions__picker-btn ${post.userReactions.includes(emoji) ? "ic-reactions__picker-btn--active" : ""}`}
                    onClick={() => handleReact(emoji)} whileHover={{ scale: 1.3 }} whileTap={{ scale: 0.85 }}
                    title={label}>{emoji}</motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {totalReactions > 0 && <span className="ic-reactions__total">{totalReactions}</span>}

        <Link href={`/person/${post.creator_mint}`} className="pub-post__view-btn">
          View →
        </Link>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            className="delete-modal__overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDeleteModal(false)}
          >
            <motion.div
              className="delete-modal"
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="delete-modal__icon"><Trash size={28} weight="fill" /></div>
              <div className="delete-modal__title">Supprimer ce post ?</div>
              <div className="delete-modal__text">
                Cette action est irréversible. Le post public et toutes ses réactions seront supprimés définitivement.
              </div>
              <div className="delete-modal__actions">
                <button className="delete-modal__cancel" onClick={() => setShowDeleteModal(false)} disabled={deleting}>
                  Annuler
                </button>
                <button className="delete-modal__confirm" onClick={handleDelete} disabled={deleting}>
                  <Trash size={14} /> {deleting ? "Suppression..." : "Supprimer"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

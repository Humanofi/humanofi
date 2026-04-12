"use client";

import Image from "next/image";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PushPin, Megaphone, CalendarBlank, ChartBar, DotsThreeVertical, PencilSimple, Trash, YoutubeLogo, Question, Archive, FloppyDisk, X, Crown, Globe, Eye } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuthFetch } from "@/lib/authFetch";
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
  is_archived?: boolean;
  creator_mint: string;
  created_at: string;
  reactions: Record<string, number>;
  userReactions: string[];
  reply_count: number;
  view_count?: number;
}

interface PostCardProps {
  post: PostData;
  creatorName: string;
  creatorAvatar: string;
  isCreator?: boolean;
  walletAddress?: string;
  holderBalance?: number;
  onVote?: (postId: string, optionIndex: number) => void;
  onRsvp?: (postId: string, status: string) => void;
  onDelete?: (postId: string) => void;
  onUpdate?: (postId: string, updates: Partial<PostData>) => void;
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
  premium: { icon: <Crown size={14} weight="bold" />, color: "#f59e0b", label: "PREMIUM" },
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
  onUpdate,
  onReactionChange,
  userVotes = {},
  userRsvps = {},
  holderBalance = Infinity,
}: PostCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showArchiveWarning, setShowArchiveWarning] = useState(false);
  const authFetch = useAuthFetch();

  const allMedia = [...(post.image_urls || []), ...(post.media_urls || [])];
  const ytMatch = post.content.match(YOUTUBE_REGEX);
  const ytVideoId = (post.metadata as any)?.youtube_id || (ytMatch ? ytMatch[1] : null);

  const images = allMedia.filter((u) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(u));
  const videos = allMedia.filter((u) => /\.(mp4|webm|mov)$/i.test(u));
  const audios = allMedia.filter((u) => /\.(mp3|wav|m4a|ogg)$/i.test(u) || u.includes("audio%2F"));
  const docs = allMedia.filter((u) => /\.(pdf|doc|docx)$/i.test(u));

  const typeInfo = TYPE_ICONS[post.post_type];

  const handleDelete = async () => {
    if (!onDelete || !walletAddress) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/inner-circle/${post.creator_mint}/posts/${post.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDelete(post.id);
        toast.success("Post supprimé");
      } else {
        const err = await res.json();
        toast.error(err.error || "Échec de la suppression");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
      setShowMenu(false);
    }
  };

  const handleArchive = async () => {
    if (!onUpdate || !walletAddress) return;
    setArchiving(true);
    try {
      const res = await authFetch(`/api/inner-circle/${post.creator_mint}/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: !post.is_archived }),
      });
      if (res.ok) {
        onUpdate(post.id, { is_archived: !post.is_archived });
        toast.success(post.is_archived ? "Post restauré" : "Post archivé");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Échec de l'archivage");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setArchiving(false);
      setShowMenu(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!onUpdate || !walletAddress || !editContent.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/inner-circle/${post.creator_mint}/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (res.ok) {
        onUpdate(post.id, { content: editContent.trim() });
        setEditing(false);
        toast.success("Post modifié");
      } else {
        toast.error("Échec de la modification");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className={`ic-post ${post.is_pinned ? "ic-post--pinned" : ""} ${post.is_archived ? "ic-post--archived" : ""}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{ borderLeft: typeInfo ? `3px solid ${typeInfo.color}` : undefined }}
    >
      {post.is_pinned && (
        <div className="ic-post__pin"><PushPin size={12} weight="fill" /> Pinned</div>
      )}
      {post.is_archived && (
        <div className="ic-post__archived-badge"><Archive size={12} weight="fill" /> Archived</div>
      )}
      {post.metadata?.is_public && (
        <div className="ic-post__public-badge"><Globe size={12} weight="fill" /> PUBLIC</div>
      )}

      {/* Header */}
      <div className="ic-post__header">
        <Image src={creatorAvatar || "/default-avatar.png"} alt={creatorName} width={36} height={36} className="ic-post__avatar" />
        <div className="ic-post__meta">
          <span className="ic-post__author">{creatorName}</span>
          <span className="ic-post__date">{timeAgo(post.created_at)}</span>
        </div>
        {typeInfo && (
          <span className="ic-post__badge" style={{ color: typeInfo.color }}>
            {typeInfo.icon} <span>{typeInfo.label}</span>
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
                  <button className="ic-post__menu-item" onClick={() => { setEditing(true); setEditContent(post.content); setShowMenu(false); }}>
                    <PencilSimple size={14} /> Edit
                  </button>
                  <button className="ic-post__menu-item" onClick={() => {
                    if (!post.is_archived && post.metadata?.is_public) {
                      setShowArchiveWarning(true);
                      setShowMenu(false);
                    } else {
                      handleArchive();
                    }
                  }} disabled={archiving}>
                    <Archive size={14} /> {archiving ? "..." : post.is_archived ? "Restore" : "Archive"}
                  </button>
                  <button className="ic-post__menu-item ic-post__menu-item--danger" onClick={() => { setShowDeleteModal(true); setShowMenu(false); }} disabled={deleting}>
                    <Trash size={14} /> {deleting ? "Deleting..." : "Delete"}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Premium gate check */}
      {(() => {
        const isPremium = post.post_type === "premium";
        const minTokens = (post.metadata?.min_tokens as number) || 0;
        const isLocked = isPremium && !isCreator && holderBalance < minTokens;

        if (isLocked) {
          return (
            <div className="ic-post__premium-locked">
              <div className="ic-post__premium-blur">
                <div className="ic-post__premium-blur-text">
                  {post.content?.slice(0, 120)}...
                </div>
              </div>
              <div className="ic-post__premium-overlay">
                <Crown size={32} weight="fill" />
                <div className="ic-post__premium-title">Premium Post</div>
                <div className="ic-post__premium-req">
                  Hold <strong>{minTokens}</strong> token{minTokens > 1 ? "s" : ""} to unlock
                </div>
                <div className="ic-post__premium-current">
                  You hold: {Math.floor(holderBalance)} token{holderBalance !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          );
        }

        return (
          <>
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
              post.content && post.content !== "Shared media" && (
                <div className="ic-post__content">{post.content}</div>
              )
            )}

            {/* YouTube embed */}
            {ytVideoId && (
              <div className="ic-post__youtube">
                <iframe width="100%" height="315" src={`https://www.youtube.com/embed/${ytVideoId}`} title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            )}

            {/* Images grid */}
            {images.length > 0 && (
              <div className={`ic-post__media ic-post__media--${Math.min(images.length, 4)}`}>
                {images.slice(0, 4).map((url, i) => (
                  <div key={i} className="ic-post__media-item">
                    <MediaPlayer url={url} />
                    {i === 3 && images.length > 4 && <div className="ic-post__media-more">+{images.length - 4}</div>}
                  </div>
                ))}
              </div>
            )}

            {videos.map((url, i) => (<div key={`v-${i}`} className="ic-post__video-wrap"><video src={url} controls preload="metadata" /></div>))}
            {audios.map((url, i) => (<div key={`a-${i}`} className="ic-post__audio-wrap"><div className="ic-post__audio-icon">🎙️</div><div className="ic-post__audio-player"><div className="ic-post__audio-label">Voice Memo</div><audio src={url} controls /></div></div>))}
            {docs.map((url, i) => (<a key={`d-${i}`} href={url} target="_blank" rel="noopener noreferrer" className="ic-post__doc"><span className="ic-post__doc-icon">📄</span><div className="ic-post__doc-info"><span className="ic-post__doc-name">Document</span><span className="ic-post__doc-action">Open →</span></div></a>))}

            {post.post_type === "poll" && post.metadata?.options && onVote && (
              <PollWidget postId={post.id} question={post.content} options={(post.metadata.options as string[]).map((text: string, i: number) => ({ text, votes: (post.metadata.votes as number[])?.[i] || 0 }))} totalVotes={((post.metadata.votes as number[]) || []).reduce((a: number, b: number) => a + b, 0)} userVote={userVotes[post.id] ?? null} onVote={onVote} endsAt={post.metadata.ends_at as string} />
            )}
            {post.post_type === "event" && post.metadata?.event_date && onRsvp && (
              <EventCard postId={post.id} title={post.metadata.event_title as string || post.content} description={post.metadata.event_description as string || ""} eventDate={post.metadata.event_date as string} rsvpCount={post.metadata.rsvp_count as number || 0} userRsvp={userRsvps[post.id] ?? null} onRsvp={onRsvp} />
            )}
            {post.post_type === "question" && walletAddress && (
              <QAWidget postId={post.id} mintAddress={post.creator_mint} walletAddress={walletAddress} isCreator={isCreator || false} />
            )}
          </>
        );
      })()}

      <div className="ic-post__footer">
        <ReactionBar postId={post.id} mintAddress={post.creator_mint} walletAddress={walletAddress || ""} reactions={post.reactions || {}} userReactions={post.userReactions || []} onReactionChange={onReactionChange} />
        {(post.view_count || 0) > 0 && (
          <span className="ic-post__views">
            <Eye size={13} weight="bold" /> {post.view_count}
          </span>
        )}
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
                Cette action est irréversible. Le post et toutes ses réactions seront supprimés définitivement.
              </div>
              <div className="delete-modal__actions">
                <button
                  className="delete-modal__cancel"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                >
                  Annuler
                </button>
                <button
                  className="delete-modal__confirm"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  <Trash size={14} /> {deleting ? "Suppression..." : "Supprimer"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Archive Public Warning Modal */}
      <AnimatePresence>
        {showArchiveWarning && (
          <motion.div
            className="delete-modal__overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowArchiveWarning(false)}
          >
            <motion.div
              className="delete-modal"
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="delete-modal__icon" style={{ color: "#f59e0b" }}><Archive size={28} weight="fill" /></div>
              <div className="delete-modal__title">Archiver un post public ?</div>
              <div className="delete-modal__text">
                Ce post est visible publiquement. En l&apos;archivant, <strong>la version publique sera supprimée définitivement</strong> et ne pourra pas être restaurée sur le feed public.
                <br /><br />
                Le post Inner Circle pourra toujours être restauré depuis tes archives.
              </div>
              <div className="delete-modal__actions">
                <button
                  className="delete-modal__cancel"
                  onClick={() => setShowArchiveWarning(false)}
                  disabled={archiving}
                >
                  Annuler
                </button>
                <button
                  className="delete-modal__confirm"
                  style={{ background: "#f59e0b", borderColor: "#f59e0b" }}
                  onClick={() => { setShowArchiveWarning(false); handleArchive(); }}
                  disabled={archiving}
                >
                  <Archive size={14} /> {archiving ? "Archivage..." : "Archiver quand même"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

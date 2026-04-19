"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { usePrivy } from "@privy-io/react-auth";
import { ChatCircle } from "@phosphor-icons/react";

interface Reply {
  id: string;
  post_id: string;
  wallet_address: string;
  content: string;
  created_at: string;
  profiles: {
    display_name: string;
    avatar_url: string;
  } | null;
}

interface PostRepliesProps {
  mintAddress: string;
  postId: string;
  replyCount: number;
  walletAddress?: string;
  onRepliesChange: (count: number) => void;
}

export default function PostReplies({ mintAddress, postId, replyCount, walletAddress, onRepliesChange }: PostRepliesProps) {
  const [expanded, setExpanded] = useState(false);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(false);
  const [newReply, setNewReply] = useState("");
  const [posting, setPosting] = useState(false);
  const { login, authenticated } = usePrivy();

  const fetchReplies = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inner-circle/${mintAddress}/reply?postId=${postId}`);
      if (res.ok) {
        const data = await res.json();
        setReplies(data.replies || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded) {
      fetchReplies();
    }
  }, [expanded, mintAddress, postId]);

  const handlePostReply = async () => {
    if (!authenticated) {
      login();
      return;
    }
    if (!newReply.trim()) return;
    setPosting(true);

    try {
      const res = await fetch(`/api/inner-circle/${mintAddress}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, content: newReply }),
      });

      if (res.ok) {
        setNewReply("");
        fetchReplies(); // Reload to get new reply with profile
        onRepliesChange(replyCount + 1);
        toast.success("Reply posted!");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to post reply");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="ic-replies-container">
      <div 
        className="ic-post__replies-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <ChatCircle size={14} weight="bold" /> {replyCount} {replyCount === 1 ? "reply" : "replies"}
      </div>

      {expanded && (
        <div className="ic-replies">
          {loading ? (
            <div className="ic-replies__loading">Loading replies...</div>
          ) : replies.length === 0 ? (
            <div className="ic-replies__empty">No replies yet. Be the first!</div>
          ) : (
            <div className="ic-replies__list">
              {replies.map(r => (
                <div key={r.id} className="ic-reply">
                  <Image 
                    src={r.profiles?.avatar_url || "/default-avatar.png"} 
                    alt="avatar" 
                    width={24} height={24} 
                    className="ic-reply__avatar" 
                  />
                  <div className="ic-reply__content">
                    <div className="ic-reply__header">
                      <span className="ic-reply__name">{r.profiles?.display_name || "Unknown"}</span>
                      <span className="ic-reply__time">
                        {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="ic-reply__text">{r.content}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="ic-reply__input-box">
            <input 
              type="text" 
              placeholder={authenticated ? "Write a reply..." : "Connect wallet to reply..."}
              value={newReply}
              onChange={(e) => setNewReply(e.target.value)}
              className="ic-reply__input"
              disabled={posting || (!authenticated && false)} // Don't strictly disable so onClick can trigger login
              onClick={() => { if (!authenticated) login(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePostReply();
              }}
            />
            {newReply.trim() && (
              <button 
                className="ic-reply__submit" 
                onClick={handlePostReply}
                disabled={posting}
              >
                {posting ? "..." : "Send"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

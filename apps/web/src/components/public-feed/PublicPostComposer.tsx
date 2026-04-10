"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImageSquare, PaperPlaneTilt } from "@phosphor-icons/react";
import { toast } from "sonner";

interface PublicPostComposerProps {
  walletAddress: string;
  canPost: boolean; // false if already posted today
  onPublished: () => void;
}

export default function PublicPostComposer({ walletAddress, canPost, onPublished }: PublicPostComposerProps) {
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const charCount = content.length;
  const charLimit = 500;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handlePublish = async () => {
    if (!content.trim() || posting) return;
    setPosting(true);

    try {
      let mediaUrls: string[] = [];

      // Upload media if any
      if (selectedFile) {
        const formData = new FormData();
        formData.append("files", selectedFile);
        // Use inner-circle upload route (works for any file)
        const uploadRes = await fetch(`/api/inner-circle/public/upload`, {
          method: "POST",
          headers: { "x-wallet-address": walletAddress },
          body: formData,
        });
        if (uploadRes.ok) {
          mediaUrls = (await uploadRes.json()).urls || [];
        }
      }

      const res = await fetch("/api/public-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet-address": walletAddress },
        body: JSON.stringify({ content: content.trim(), mediaUrls }),
      });

      if (res.ok) {
        toast.success("Published to your public feed!");
        setContent("");
        setSelectedFile(null);
        setPreview(null);
        setExpanded(false);
        onPublished();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to publish");
      }
    } catch {
      toast.error("Failed to publish");
    } finally {
      setPosting(false);
    }
  };

  if (!canPost) {
    return (
      <div className="pub-composer pub-composer--disabled">
        <div className="pub-composer__limit">
          <span>✓ Posted today</span>
          <span className="pub-composer__limit-sub">Your public post is live. Come back tomorrow!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pub-composer">
      <div className="pub-composer__input-row" onClick={() => setExpanded(true)}>
        <textarea
          className="pub-composer__input"
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, charLimit))}
          placeholder="Share a public update (visible to everyone)..."
          rows={expanded ? 3 : 1}
          onFocus={() => setExpanded(true)}
        />
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            {/* Media preview */}
            {preview && (
              <div className="pub-composer__preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Preview" />
                <button className="pub-composer__preview-x" onClick={() => { setSelectedFile(null); setPreview(null); }}>✕</button>
              </div>
            )}

            {/* Bottom bar */}
            <div className="pub-composer__bar">
              <div className="pub-composer__actions">
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileSelect} />
                <button className="ic-composer__action-btn" onClick={() => fileInputRef.current?.click()} title="Add image">
                  <ImageSquare size={18} />
                </button>
              </div>

              <div className="pub-composer__right">
                <span className={`pub-composer__charcount ${charCount > charLimit * 0.9 ? "pub-composer__charcount--warn" : ""}`}>
                  {charCount}/{charLimit}
                </span>
                <motion.button
                  className="pub-composer__submit"
                  disabled={posting || !content.trim()}
                  onClick={handlePublish}
                  whileTap={{ scale: 0.95 }}
                >
                  <PaperPlaneTilt size={16} weight="fill" />
                  {posting ? "Publishing..." : "Publish"}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChatText, Megaphone, ChartBar, CalendarBlank, Paperclip, Microphone, Stop, Play, Trash, ImageSquare, VideoCamera, Globe, YoutubeLogo, Question, Crown, Lock, FileText } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuthFetch } from "@/lib/authFetch";

type PostType = "text" | "announcement" | "poll" | "event" | "youtube" | "question" | "premium";

// ── Public Post Toggle with Countdown ──
function PublicPostToggle({
  isPublic,
  setIsPublic,
  walletAddress,
}: {
  isPublic: boolean;
  setIsPublic: (v: boolean) => void;
  walletAddress: string;
}) {
  const [canPost, setCanPost] = useState<boolean | null>(null);
  const [nextPostAt, setNextPostAt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState("");
  const authFetch = useAuthFetch();

  useEffect(() => {
    const check = async () => {
      try {
        const res = await authFetch("/api/public-posts/status");
        const data = await res.json();
        setCanPost(data.canPost ?? false);
        if (!data.canPost && data.nextPostAt) {
          setNextPostAt(data.nextPostAt);
        }
      } catch {
        setCanPost(true);
      }
    };
    check();
  }, [walletAddress]);

  useEffect(() => {
    if (!nextPostAt || canPost) return;
    const tick = () => {
      const diff = new Date(nextPostAt).getTime() - Date.now();
      if (diff <= 0) {
        setCanPost(true);
        setNextPostAt(null);
        setCountdown("");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [nextPostAt, canPost]);

  useEffect(() => {
    if (canPost === false && isPublic) setIsPublic(false);
  }, [canPost, isPublic, setIsPublic]);

  return (
    <label
      className={`ic-composer__public-toggle ${canPost === false ? "ic-composer__public-toggle--disabled" : ""}`}
      title={canPost === false ? `Next public post in ${countdown}` : "Share this post publicly (1/day)"}
    >
      <input
        type="checkbox"
        checked={isPublic}
        onChange={(e) => setIsPublic(e.target.checked)}
        disabled={canPost === false || canPost === null}
      />
      <Globe size={14} weight={isPublic ? "fill" : "regular"} />
      {canPost === false ? (
        <span className="ic-composer__public-countdown"><Lock size={12} weight="bold" /> {countdown}</span>
      ) : (
        <span>Public</span>
      )}
    </label>
  );
}

interface PostComposerProps {
  mintAddress: string;
  walletAddress: string;
  onPublished: () => void;
}

const TYPE_CONFIG: Record<PostType, { icon: React.ReactNode; label: string; placeholder: string }> = {
  text: { icon: <ChatText size={16} weight="bold" />, label: "Message", placeholder: "Share something with your Inner Circle..." },
  announcement: { icon: <Megaphone size={16} weight="bold" />, label: "Announcement", placeholder: "Make an important announcement..." },
  youtube: { icon: <YoutubeLogo size={16} weight="bold" />, label: "YouTube", placeholder: "Add a message about this video..." },
  question: { icon: <Question size={16} weight="bold" />, label: "AMA", placeholder: "Invite your holders to ask you questions..." },
  poll: { icon: <ChartBar size={16} weight="bold" />, label: "Poll", placeholder: "Ask your holders a question..." },
  event: { icon: <CalendarBlank size={16} weight="bold" />, label: "Event", placeholder: "Describe your upcoming event..." },
  premium: { icon: <Crown size={16} weight="bold" />, label: "Premium", placeholder: "Exclusive content for top holders..." },
};

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export default function PostComposer({ mintAddress, walletAddress, onPublished }: PostComposerProps) {
  const [postType, setPostType] = useState<PostType>("text");
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isPublic, setIsPublic] = useState(false);

  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [eventDate, setEventDate] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [premiumThreshold, setPremiumThreshold] = useState(100);
  const authFetch = useAuthFetch();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{ url: string; type: string; name: string }[]>([]);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        const previewUrl = URL.createObjectURL(audioBlob);
        setSelectedFiles((prev) => [...prev, audioFile].slice(0, 6));
        setFilePreviews((prev) => [...prev, { url: previewUrl, type: "audio", name: "Voice Memo" }].slice(0, 6));
        setAudioPreview(previewUrl);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      setAudioPreview(null);
      recordingTimerRef.current = setInterval(() => setRecordingTime((prev) => prev + 1), 1000);
      setExpanded(true);
    } catch {
      toast.error("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  useEffect(() => {
    return () => { if (recordingTimerRef.current) clearInterval(recordingTimerRef.current); };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setSelectedFiles((prev) => [...prev, ...files].slice(0, 6));
    const newPreviews = files.map((f) => ({
      url: URL.createObjectURL(f),
      type: f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "audio" : "document",
      name: f.name,
    }));
    setFilePreviews((prev) => [...prev, ...newPreviews].slice(0, 6));
  };

  const removeFile = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
    setFilePreviews((prev) => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handlePublish = async () => {
    if (!content.trim() && selectedFiles.length === 0) return;
    setPosting(true);

    try {
      let mediaUrls: string[] = [];
      if (selectedFiles.length > 0) {
        const formData = new FormData();
        selectedFiles.forEach((f) => formData.append("files", f));
        const uploadRes = await authFetch(`/api/inner-circle/${mintAddress}/upload`, {
          method: "POST",
          body: formData,
        });
        if (uploadRes.ok) {
          mediaUrls = (await uploadRes.json()).urls || [];
        } else {
          toast.error("Failed to upload media");
          setPosting(false);
          return;
        }
      }

      const metadata: Record<string, unknown> = {};
      if (postType === "poll") {
        metadata.options = pollOptions.filter((o) => o.trim());
        metadata.votes = new Array((metadata.options as string[]).length).fill(0);
      }
      if (postType === "event") {
        metadata.event_date = eventDate;
        metadata.event_title = eventTitle || content;
        metadata.rsvp_count = 0;
      }
      if (postType === "youtube") {
        const ytMatch = youtubeUrl.match(YOUTUBE_REGEX);
        if (!ytMatch) {
          toast.error("Please enter a valid YouTube URL");
          setPosting(false);
          return;
        }
        metadata.youtube_url = youtubeUrl;
        metadata.youtube_id = ytMatch[1];
      }
      if (postType === "premium") {
        metadata.min_tokens = premiumThreshold;
      }
      if (isPublic) {
        metadata.is_public = true;
      }

      const res = await authFetch(`/api/inner-circle/${mintAddress}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim() || (mediaUrls.length > 0 ? "Shared media" : ""),
          post_type: postType,
          metadata,
          mediaUrls,
        }),
      });

      if (res.ok) {
        // Also publish as public post if checkbox is checked
        if (isPublic && (postType === "text" || postType === "youtube")) {
          try {
            const pubRes = await authFetch("/api/public-posts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: content.trim(), mediaUrls }),
            });
            if (pubRes.ok) {
              toast.success("Also shared publicly!");
            } else {
              const pubErr = await pubRes.json();
              if (pubRes.status === 429) {
                toast.info(pubErr.error || "Already posted publicly today");
              }
            }
          } catch { /* silent */ }
        }
        toast.success("Published!");
        setContent(""); setPostType("text"); setSelectedFiles([]); setFilePreviews([]);
        setPollOptions(["", ""]); setEventDate(""); setEventTitle(""); setExpanded(false);
        setAudioPreview(null); setIsPublic(false); setYoutubeUrl(""); setPremiumThreshold(100);
        onPublished();
      } else {
        toast.error((await res.json()).error || "Failed to publish");
      }
    } catch { toast.error("Failed to publish"); }
    finally { setPosting(false); }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="ic-composer">
      <div className="ic-composer__types">
        {(Object.keys(TYPE_CONFIG) as PostType[]).map((type) => (
          <button
            key={type}
            className={`ic-composer__type ${postType === type ? "ic-composer__type--active" : ""}`}
            onClick={() => { setPostType(type); setExpanded(true); }}
          >
            {TYPE_CONFIG[type].icon}
            <span>{TYPE_CONFIG[type].label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {(expanded || content || selectedFiles.length > 0 || isRecording) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            {/* Voice Recording UI */}
            {isRecording ? (
              <div className="ic-voice-recorder">
                <div className="ic-voice-recorder__wave">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="ic-voice-recorder__bar"
                      animate={{ height: [4, 12 + Math.random() * 16, 4] }}
                      transition={{ duration: 0.4 + Math.random() * 0.3, repeat: Infinity, repeatType: "reverse", delay: i * 0.05 }}
                    />
                  ))}
                </div>
                <span className="ic-voice-recorder__time">{formatTime(recordingTime)}</span>
                <button className="ic-voice-recorder__stop" onClick={stopRecording}>
                  <Stop size={16} weight="fill" />
                </button>
              </div>
            ) : (
              <textarea
                className="ic-composer__input"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={TYPE_CONFIG[postType].placeholder}
                onFocus={() => setExpanded(true)}
                rows={3}
              />
            )}

            {/* Poll options */}
            {postType === "poll" && (
              <div className="ic-composer__poll-options">
                {pollOptions.map((opt, i) => (
                  <div key={i} className="ic-composer__poll-option">
                    <input type="text" placeholder={`Option ${i + 1}`} value={opt}
                      onChange={(e) => { const u = [...pollOptions]; u[i] = e.target.value; setPollOptions(u); }}
                      className="ic-composer__poll-input"
                    />
                    {i >= 2 && <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} className="ic-composer__poll-remove"><Trash size={14} /></button>}
                  </div>
                ))}
                {pollOptions.length < 6 && (
                  <button className="ic-composer__poll-add" onClick={() => setPollOptions([...pollOptions, ""])}>+ Add option</button>
                )}
              </div>
            )}

            {/* YouTube fields */}
            {postType === "youtube" && (
              <div className="ic-composer__youtube-field">
                <input
                  type="url"
                  className="ic-composer__youtube-input"
                  placeholder="Paste YouTube URL (e.g. youtube.com/watch?v=...)"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                />
                {(() => {
                  const m = youtubeUrl.match(YOUTUBE_REGEX);
                  if (!m) return null;
                  return (
                    <div className="ic-composer__youtube-preview">
                      <iframe
                        width="100%"
                        height="200"
                        src={`https://www.youtube.com/embed/${m[1]}`}
                        title="Preview"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Event fields */}
            {postType === "event" && (
              <div className="ic-composer__event-fields">
                <input type="text" placeholder="Event title" value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)} className="ic-composer__event-input" />
                <input type="datetime-local" value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)} className="ic-composer__event-input" />
              </div>
            )}

            {/* Premium threshold */}
            {postType === "premium" && (
              <div className="ic-composer__premium-field">
                <div className="ic-composer__premium-label">
                  <Crown size={14} weight="fill" />
                  <span>Minimum tokens to unlock</span>
                </div>
                <div className="ic-composer__premium-controls">
                  <div className="ic-composer__premium-presets">
                    {[100, 1000, 10000, 100000, 1000000].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`ic-composer__premium-preset ${premiumThreshold === v ? "ic-composer__premium-preset--active" : ""}`}
                        onClick={() => setPremiumThreshold(v)}
                      >
                        {v >= 1000000 ? `${v / 1000000}M` : v >= 1000 ? `${v / 1000}K` : v}
                      </button>
                    ))}
                  </div>
                  <div className="ic-composer__premium-input-wrap">
                    <input
                      type="number"
                      min={1}
                      max={100000000}
                      step={100}
                      value={premiumThreshold}
                      onChange={(e) => setPremiumThreshold(Math.max(1, parseInt(e.target.value) || 100))}
                      className="ic-composer__premium-input"
                    />
                    <span className="ic-composer__premium-unit">tokens</span>
                  </div>
                </div>
              </div>
            )}

            {/* Media previews */}
            {filePreviews.length > 0 && (
              <div className="ic-composer__previews">
                {filePreviews.map((preview, i) => (
                  <div key={i} className="ic-composer__preview-card">
                    {preview.type === "image" && <img src={preview.url} alt={preview.name} className="ic-composer__preview-img" />}
                    {preview.type === "video" && (
                      <div className="ic-composer__preview-placeholder"><VideoCamera size={20} /> <span>Video</span></div>
                    )}
                    {preview.type === "audio" && (
                      <div className="ic-composer__preview-audio">
                        <Microphone size={16} />
                        <audio src={preview.url} controls />
                      </div>
                    )}
                    {preview.type === "document" && (
                      <div className="ic-composer__preview-placeholder"><FileText size={18} weight="bold" /> <span>{preview.name.length > 20 ? preview.name.slice(0, 20) + "..." : preview.name}</span></div>
                    )}
                    <button className="ic-composer__preview-remove" onClick={() => removeFile(i)}><Trash size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            {/* Bottom bar */}
            <div className="ic-composer__bar">
              <div className="ic-composer__actions">
                <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx" style={{ display: "none" }} onChange={handleFileSelect} />
                <button className="ic-composer__action-btn" onClick={() => fileInputRef.current?.click()} title="Add media">
                  <ImageSquare size={18} />
                </button>
                <button
                  className={`ic-composer__action-btn ${isRecording ? "ic-composer__action-btn--recording" : ""}`}
                  onClick={isRecording ? stopRecording : startRecording}
                  title={isRecording ? "Stop recording" : "Record voice"}
                >
                  <Microphone size={18} />
                </button>
              </div>

              {/* Make Public toggle (text & YouTube) */}
              {(postType === "text" || postType === "youtube") && (
                <PublicPostToggle
                  isPublic={isPublic}
                  setIsPublic={setIsPublic}
                  walletAddress={walletAddress}
                />
              )}

              <motion.button
                className="btn-solid ic-composer__publish"
                disabled={posting || (!content.trim() && selectedFiles.length === 0)}
                onClick={handlePublish}
                whileTap={{ scale: 0.95 }}
              >
                {posting ? "Publishing..." : "Publish"}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

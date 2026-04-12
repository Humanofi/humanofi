"use client";

import { useState, useEffect } from "react";
import { usePerson } from "../layout";
import { useHumanofi } from "@/hooks/useHumanofi";
import { useAuthFetch } from "@/lib/authFetch";
import { toast } from "sonner";
import Image from "next/image";
import {
  PencilSimple, Palette, YoutubeLogo, Images, FloppyDisk, Check,
} from "@phosphor-icons/react";

const TOKEN_COLORS = [
  { key: "blue", hex: "#1144ff", label: "Humanofi Blue" },
  { key: "violet", hex: "#7c3aed", label: "Créatif" },
  { key: "emerald", hex: "#059669", label: "Natural" },
  { key: "orange", hex: "#ea580c", label: "Énergie" },
  { key: "crimson", hex: "#dc2626", label: "Passion" },
  { key: "cyan", hex: "#0891b2", label: "Tech" },
  { key: "amber", hex: "#d97706", label: "Luxe" },
  { key: "pink", hex: "#db2777", label: "Pop" },
];

export default function ManagePage() {
  const { creator, isCreator } = usePerson();
  const { walletAddress } = useHumanofi();
  const authFetch = useAuthFetch();
  const [saving, setSaving] = useState(false);

  // Form state
  const [subtitle, setSubtitle] = useState("");
  const [bio, setBio] = useState("");
  const [story, setStory] = useState("");
  const [offer, setOffer] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [tokenColor, setTokenColor] = useState("blue");
  const [gallery, setGallery] = useState<string[]>([]);

  // Init form from creator data
  useEffect(() => {
    if (creator) {
      setSubtitle(creator.subtitle || "");
      setBio(creator.bio || "");
      setStory(creator.story || "");
      setOffer(creator.offer || "");
      setYoutubeUrl(creator.youtube_url || "");
      setTokenColor(creator.token_color || "blue");
      setGallery(creator.gallery_urls || []);
    }
  }, [creator]);

  if (!isCreator || !creator) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-muted)" }}>
          Only the token creator can manage this profile.
        </p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!walletAddress) { toast.error("Connect your wallet first"); return; }
    setSaving(true);

    try {
      const res = await authFetch("/api/creators/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subtitle: subtitle.slice(0, 80),
          bio,
          story,
          offer,
          youtube_url: youtubeUrl,
          token_color: tokenColor,
          gallery_urls: gallery,
        }),
      });

      if (res.ok) {
        toast.success("Profile updated!");
      } else {
        const data = await res.json();
        toast.error(data.error || "Update failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || gallery.length >= 6) return;

    for (let i = 0; i < Math.min(files.length, 6 - gallery.length); i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", "gallery");

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          setGallery(prev => [...prev, data.url]);
        }
      } catch {
        toast.error("Upload failed");
      }
    }
  };

  const removeGalleryImage = (index: number) => {
    setGallery(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="manage-page">
      <h2 className="manage-page__title">
        <PencilSimple size={24} weight="bold" /> Manage Profile
      </h2>

      {/* ── Subtitle / Mood ── */}
      <div className="manage-section">
        <label className="manage-label">
          Subtitle / Mood
          <span className="manage-hint">{subtitle.length}/80 — Displayed under your name</span>
        </label>
        <input
          type="text"
          className="manage-input"
          placeholder="Ex: Building the future of social tokens 🚀"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value.slice(0, 80))}
          maxLength={80}
        />
      </div>

      {/* ── Bio ── */}
      <div className="manage-section">
        <label className="manage-label">Bio</label>
        <textarea
          className="manage-textarea"
          placeholder="Short bio about you..."
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
        />
      </div>

      {/* ── Story ── */}
      <div className="manage-section">
        <label className="manage-label">Your Story</label>
        <textarea
          className="manage-textarea"
          placeholder="Tell your story — why did you create this token?"
          value={story}
          onChange={(e) => setStory(e.target.value)}
          rows={5}
        />
      </div>

      {/* ── Offer ── */}
      <div className="manage-section">
        <label className="manage-label">What You Offer (Inner Circle)</label>
        <textarea
          className="manage-textarea"
          placeholder="What value do you provide to your token holders?"
          value={offer}
          onChange={(e) => setOffer(e.target.value)}
          rows={4}
        />
      </div>

      {/* ── Token Color ── */}
      <div className="manage-section">
        <label className="manage-label">
          <Palette size={16} weight="bold" /> Token Color — Your personality
        </label>
        <div className="manage-colors">
          {TOKEN_COLORS.map(c => (
            <button
              key={c.key}
              className={`manage-color-btn ${tokenColor === c.key ? "manage-color-btn--active" : ""}`}
              style={{ background: c.hex }}
              onClick={() => setTokenColor(c.key)}
              title={c.label}
            >
              {tokenColor === c.key && <Check size={16} weight="bold" color="#fff" />}
            </button>
          ))}
        </div>
        <div className="manage-hint" style={{ marginTop: 8 }}>
          Selected: {TOKEN_COLORS.find(c => c.key === tokenColor)?.label || tokenColor}
        </div>
      </div>

      {/* ── YouTube ── */}
      <div className="manage-section">
        <label className="manage-label">
          <YoutubeLogo size={16} weight="bold" style={{ color: "#ff0000" }} /> YouTube Video (optional)
        </label>
        <input
          type="url"
          className="manage-input"
          placeholder="https://youtube.com/watch?v=..."
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
        />
      </div>

      {/* ── Gallery ── */}
      <div className="manage-section">
        <label className="manage-label">
          <Images size={16} weight="bold" /> Gallery ({gallery.length}/6)
        </label>
        <div className="manage-gallery">
          {gallery.map((url, i) => (
            <div key={i} className="manage-gallery__item">
              <Image src={url} alt={`Gallery ${i + 1}`} width={200} height={150} style={{ objectFit: "cover", width: "100%", height: "100%" }} />
              <button className="manage-gallery__remove" onClick={() => removeGalleryImage(i)}>✕</button>
            </div>
          ))}
          {gallery.length < 6 && (
            <label className="manage-gallery__add">
              <input type="file" accept="image/*" multiple onChange={handleGalleryUpload} style={{ display: "none" }} />
              <span>+</span>
            </label>
          )}
        </div>
      </div>

      {/* ── Save ── */}
      <button className="manage-save" onClick={handleSave} disabled={saving}>
        <FloppyDisk size={18} weight="bold" />
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}

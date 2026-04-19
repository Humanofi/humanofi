"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { X, PencilSimple, Check } from "@phosphor-icons/react";
import { useAuthFetch } from "@/lib/authFetch";
import { generateIdenticon } from "@/lib/identicon";
import { toast } from "sonner";

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  currentDisplayName: string;
  currentAvatarUrl: string | null;
  currentBio: string;
  onSave: (displayName: string, bio: string) => void;
}

export default function ProfileEditModal({
  isOpen,
  onClose,
  walletAddress,
  currentDisplayName,
  currentAvatarUrl,
  currentBio,
  onSave,
}: ProfileEditModalProps) {
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [bio, setBio] = useState(currentBio);
  const [saving, setSaving] = useState(false);
  const authFetch = useAuthFetch();

  // Sync fields when modal opens or props change
  useEffect(() => {
    if (isOpen) {
      setDisplayName(currentDisplayName);
      setBio(currentBio);
    }
  }, [isOpen, currentDisplayName, currentBio]);

  const avatarUrl = currentAvatarUrl || generateIdenticon(walletAddress);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (displayName.trim().length < 2) {
      toast.error("Display name must be at least 2 characters");
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          walletAddress,
          displayName: displayName.trim(),
          bio: bio.trim(),
        }),
      });

      if (res.ok) {
        toast.success("Profile updated!");
        onSave(displayName.trim(), bio.trim());
        onClose();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update profile");
      }
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="profile-modal__header">
          <PencilSimple size={18} weight="bold" />
          <span>Edit Profile</span>
          <button className="profile-modal__close" onClick={onClose}>
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Avatar */}
        <div className="profile-modal__avatar-section">
          <Image
            src={avatarUrl}
            alt="Your avatar"
            width={64}
            height={64}
            className="profile-modal__avatar"
          />
          <div className="profile-modal__avatar-info">
            <span className="profile-modal__avatar-label">Your identicon</span>
            <span className="profile-modal__avatar-sub">
              Generated from your wallet — unique to you
            </span>
          </div>
        </div>

        {/* Fields */}
        <div className="profile-modal__field">
          <label className="profile-modal__label">Display Name</label>
          <input
            type="text"
            className="profile-modal__input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={30}
            placeholder="How others see you..."
          />
          <span className="profile-modal__count">{displayName.length}/30</span>
        </div>

        <div className="profile-modal__field">
          <label className="profile-modal__label">Bio <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
          <textarea
            className="profile-modal__textarea"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            placeholder="One line about you..."
            rows={2}
          />
          <span className="profile-modal__count">{bio.length}/160</span>
        </div>

        {/* Wallet */}
        <div className="profile-modal__wallet">
          {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
        </div>

        {/* Action */}
        <button
          className="profile-modal__save"
          onClick={handleSave}
          disabled={saving || displayName.trim().length < 2}
        >
          <Check size={16} weight="bold" />
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </div>
  );
}

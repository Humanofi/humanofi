"use client";

import React from "react";

interface PreviewCardProps {
  name: string;
  symbol: string;
  bio: string;
  category: string;
  categoryEmoji: string;
  country: string;
  countryName: string;
  avatar: string | null;
  twitter: string;
  linkedin: string;
  instagram: string;
  website: string;
}

function LivePreviewCardRaw({
  name,
  symbol,
  bio,
  category,
  categoryEmoji,
  countryName,
  avatar,
  twitter,
  linkedin,
  instagram,
  website,
}: PreviewCardProps) {
  const hasSocials = !!(twitter || linkedin || instagram || website);

  return (
    <div className="preview-card-sticky">
      <div className="preview-card-label">Live Preview</div>
      <div className="preview-card">
        {/* Photo */}
        <div
          className="preview-card__photo"
          style={avatar ? { backgroundImage: `url(${avatar})` } : undefined}
        >
          {!avatar && <div className="preview-card__placeholder">◈</div>}
        </div>

        {/* Info */}
        <div className="preview-card__info">
          {category && (
            <div className="preview-card__badge">
              {categoryEmoji} {category}
            </div>
          )}

          <div className="preview-card__name">
            {name || "Your Name"}
          </div>

          {symbol && (
            <div className="preview-card__symbol">${symbol}</div>
          )}

          <div className="preview-card__bio">
            {bio || "Your bio will appear here..."}
          </div>

          {hasSocials && (
            <div className="preview-card__socials">
              {twitter && <span className="preview-card__social-tag">𝕏</span>}
              {linkedin && <span className="preview-card__social-tag">in</span>}
              {instagram && <span className="preview-card__social-tag">📷</span>}
              {website && <span className="preview-card__social-tag">🌐</span>}
            </div>
          )}

          {countryName && (
            <div className="preview-card__country">
              📍 {countryName}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const LivePreviewCard = React.memo(LivePreviewCardRaw);

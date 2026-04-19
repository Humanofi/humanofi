"use client";

import React from "react";
import Flag from "@/components/Flag";

interface PreviewCardProps {
  name: string;
  symbol: string;
  bio: string;
  category: string;
  categoryLabel: string;
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
  categoryLabel,
  country,
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
              {categoryLabel || category}
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
              {instagram && <span className="preview-card__social-tag">IG</span>}
              {website && <span className="preview-card__social-tag">WEB</span>}
            </div>
          )}

          {(countryName || country) && (
            <div className="preview-card__country">
              <Flag code={country} size={12} /> {countryName}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const LivePreviewCard = React.memo(LivePreviewCardRaw);

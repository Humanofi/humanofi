// ========================================
// Humanofi — Country Flag Component
// ========================================
// Renders a clean rectangular SVG flag from flagcdn.com.
// No library needed — just a CDN image.
// Brutalist style: rectangular, no border-radius, crisp.

"use client";

import Image from "next/image";

interface FlagProps {
  code: string;        // ISO 3166-1 alpha-2 country code (e.g. "FR", "US")
  size?: number;       // Height in px (width auto based on aspect ratio)
  className?: string;
}

/**
 * Renders a rectangular country flag image.
 * Uses flagcdn.com for clean, consistent SVG flags.
 */
export default function Flag({ code, size = 16, className }: FlagProps) {
  if (!code || code.length !== 2 || code === "—") return null;

  const lowerCode = code.toLowerCase();
  // flagcdn provides flags at various widths. w40 is good for small displays.
  const src = `https://flagcdn.com/w40/${lowerCode}.png`;

  return (
    <Image
      src={src}
      alt={code}
      width={Math.round(size * 1.5)}
      height={size}
      className={`flag ${className || ""}`}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        objectFit: "cover",
        border: "1px solid var(--border)",
      }}
      unoptimized // CDN images don't need Next.js optimization
    />
  );
}

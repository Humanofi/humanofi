"use client";

import Image from "next/image";
import { FileText } from "@phosphor-icons/react";

interface MediaPlayerProps {
  url: string;
}

export default function MediaPlayer({ url }: MediaPlayerProps) {
  const urlLower = url.toLowerCase();
  
  const isVideo = urlLower.endsWith(".mp4") || urlLower.endsWith(".webm") || urlLower.endsWith(".mov");
  const isAudio = urlLower.endsWith(".mp3") || urlLower.endsWith(".wav") || urlLower.endsWith(".m4a") || urlLower.includes("audio%2Fwebm");
  const isPdf = urlLower.endsWith(".pdf");

  if (isVideo) {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        style={{ width: "100%", maxHeight: 400, background: "#000", border: "2px solid var(--border)", boxShadow: "2px 2px 0px var(--border)" }}
      />
    );
  }

  if (isAudio) {
    return (
      <audio
        src={url}
        controls
        style={{ width: "100%", marginTop: 8 }}
      />
    );
  }

  if (isPdf) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="ic-post__media-pdf">
        <span className="ic-post__media-pdf-icon"><FileText size={18} weight="bold" /></span>
        View Document (PDF)
      </a>
    );
  }

  // Fallback to Image
  return (
    <Image
      src={url}
      alt="Media"
      width={400}
      height={300}
      style={{ objectFit: "cover", width: "100%", height: "100%", border: "2px solid var(--border)", boxShadow: "2px 2px 0px var(--border)" }}
    />
  );
}

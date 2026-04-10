"use client";

import Image from "next/image";

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
        style={{ width: "100%", maxHeight: 400, borderRadius: 8, background: "#000" }}
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
        <span className="ic-post__media-pdf-icon">📄</span>
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
      style={{ objectFit: "cover", borderRadius: 8, width: "100%", height: "100%" }}
    />
  );
}

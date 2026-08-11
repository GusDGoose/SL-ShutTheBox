"use client";

import { embedUrl } from "@/lib/youtube";

// Only ever mounted from inside a click handler — that user gesture is what
// lets the autoplay=1 embed actually start with sound (browser autoplay policy).
export function YouTubePlayer({ videoId, title }: { videoId: string; title?: string }) {
  return (
    <iframe
      src={embedUrl(videoId)}
      title={title ?? "Victory song"}
      allow="autoplay; encrypted-media"
      allowFullScreen
      className="aspect-video w-full rounded-xl border-0"
    />
  );
}

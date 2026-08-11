// YouTube video ids are exactly 11 chars of this alphabet.
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// Accepts every common YouTube URL shape (watch?v=, youtu.be/, shorts/, embed/,
// live/, music./m. hosts, extra query params) and returns the 11-char video id,
// or null if this isn't recognizably a YouTube video link.
export function extractVideoId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let candidate: string | null | undefined = null;

  if (host === "youtu.be") {
    candidate = url.pathname.split("/")[1];
  } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const [, first, second] = url.pathname.split("/");
    if (first === "watch") {
      candidate = url.searchParams.get("v");
    } else if (first === "shorts" || first === "embed" || first === "live") {
      candidate = second;
    }
  }

  return candidate && ID_PATTERN.test(candidate) ? candidate : null;
}

// youtube-nocookie.com is YouTube's privacy-enhanced embed host; autoplay=1
// works because we only mount this iframe inside a user tap (autoplay policy).
export function embedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
}

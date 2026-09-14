import QRCode from "qrcode";

/**
 * The join link as something a phone camera can read.
 *
 * Rendered on the server into an inline SVG: it has no state, it never changes
 * for a given event, and shipping a QR library to every phone to draw a square
 * that the projector shows once would be absurd.
 *
 * Returns null rather than throwing when there is no absolute URL to encode —
 * a QR code is a convenience, and the code and the link beside it still work.
 */
export async function QrCode({
  url,
  size = 200,
}: {
  url: string;
  size?: number;
}) {
  if (!url.startsWith("http")) return null;

  let svg: string;
  try {
    svg = await QRCode.toString(url, {
      type: "svg",
      margin: 1,
      width: size,
      // High correction, because this gets photographed off a projector at an
      // angle from the back of a room.
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    return null;
  }

  return (
    <div
      role="img"
      aria-label="QR code for the join link"
      // White plate: the wood themes are dark enough that a transparent QR
      // would not scan.
      className="inline-block rounded-[var(--radius-control)] bg-white p-2 shadow-[var(--shadow-card)] [&>svg]:block [&>svg]:size-full"
      style={{ width: size + 16, height: size + 16 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

import { codeSpaced } from "@/lib/tournament-code";
import { QrCode } from "@/components/tournament/qr-code";
import { ShareButton } from "@/components/tournament/share-button";

/**
 * How everybody else gets in: the code, big enough to read from the back of the
 * room, the link to type, and a QR to point a camera at.
 *
 * A server component, so the QR is drawn once here rather than by every phone.
 */
export function JoinPanel({
  name,
  code,
  joinUrl,
}: {
  name: string;
  code: string;
  joinUrl: string;
}) {
  return (
    <section className="felt flex flex-col items-center gap-4 rounded-[var(--radius-card)] p-5 text-center text-ivory">
      <div className="flex flex-col gap-1">
        <span className="eyebrow text-ivory/70">Team play</span>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          {name}
        </h1>
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="eyebrow text-ivory/70">Join code</span>
        {/* Spelled out for a screen reader: "F K A 4 2 9", not a word. Wide
            tracking for the same reason on a projector — a code read wrong is
            a person who never gets in. */}
        <p
          aria-label={`Join code ${codeSpaced(code)}`}
          className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-[0.2em] sm:text-5xl"
        >
          {code}
        </p>
      </div>

      <QrCode url={joinUrl} />

      <p className="max-w-full break-all text-xs text-ivory/80">
        {joinUrl.replace(/^https?:\/\//, "")}
      </p>

      <ShareButton
        path={`/t/${code}`}
        title={`Join ${name}`}
        label="Share the link"
      />
    </section>
  );
}

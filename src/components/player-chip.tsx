// Small emoji+name pill. Server-safe (no client JS).
export function PlayerChip({
  emoji,
  name,
  className = "",
}: {
  emoji: string;
  name: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-1 text-sm dark:border-white/10 ${className}`}
    >
      <span>{emoji}</span>
      <span className="font-medium">{name}</span>
    </span>
  );
}

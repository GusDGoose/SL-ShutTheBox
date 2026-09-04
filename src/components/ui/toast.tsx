"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "info" | "success" | "error" | "badge";
export type ToastInput = {
  kind?: ToastKind;
  title: string;
  body?: string;
  /** Milliseconds on screen. Badges linger; errors wait to be read. */
  duration?: number;
};
type Toast = ToastInput & { id: number };

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

const DEFAULT_DURATION: Record<ToastKind, number> = {
  info: 4000,
  success: 4000,
  badge: 6000,
  error: 8000,
};

const KIND_STYLE: Record<ToastKind, string> = {
  info: "border-line bg-surface text-ink",
  success: "border-shut/40 bg-surface text-ink",
  badge: "border-brass/60 bg-surface text-ink",
  error: "border-danger/50 bg-surface text-ink",
};

const KIND_ICON: Record<ToastKind, string> = {
  info: "🎲",
  success: "✓",
  badge: "🏅",
  error: "⚠️",
};

let nextId = 0;

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((input: ToastInput) => {
    const id = nextId++;
    const kind = input.kind ?? "info";
    setToasts((prev) => [...prev, { ...input, kind, id }]);
    const duration = input.duration ?? DEFAULT_DURATION[kind];
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      duration,
    );
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Announced politely so a pending/failed action reaches a screen reader
          without stealing focus. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-control)] border px-4 py-3 shadow-[var(--shadow-card)] ${KIND_STYLE[t.kind ?? "info"]}`}
          >
            <span aria-hidden className="text-lg leading-6">
              {KIND_ICON[t.kind ?? "info"]}
            </span>
            <div className="flex-1 text-sm">
              <p className="font-semibold">{t.title}</p>
              {t.body && <p className="text-ink-muted">{t.body}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="text-ink-muted hover:text-ink"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used inside <Toaster>");
  return toast;
}

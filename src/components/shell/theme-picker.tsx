"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import {
  MODES,
  MODE_COOKIE,
  THEMES,
  THEME_COOKIE,
  THEME_META,
  resolveMode,
  serializeThemeCookie,
  type Mode,
  type Theme,
} from "@/lib/theme";

// Both pickers write the cookie and stamp <html> in the same tick, so the board
// changes under your thumb with no server round trip and no flash.
function persist(name: string, value: string) {
  document.cookie = serializeThemeCookie(name, value);
}

function applyToDocument(theme: Theme, mode: Mode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = theme;
  root.dataset.mode = resolveMode(theme, mode, prefersDark);
}

export function AppearanceControls({
  initialTheme,
  initialMode,
}: {
  initialTheme: Theme;
  initialMode: Mode;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [mode, setMode] = useState<Mode>(initialMode);
  const nightOnly = THEME_META[theme].forcesDark;

  function chooseTheme(next: Theme) {
    setTheme(next);
    persist(THEME_COOKIE, next);
    applyToDocument(next, mode);
  }

  function chooseMode(next: Mode) {
    setMode(next);
    persist(MODE_COOKIE, next);
    applyToDocument(theme, next);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">Board</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((id) => {
            const meta = THEME_META[id];
            const selected = id === theme;
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseTheme(id)}
                  className={`flex w-full flex-col gap-2 rounded-[var(--radius-card)] border p-3 text-left transition-colors ${
                    selected
                      ? "border-brass bg-surface-2"
                      : "border-line bg-surface hover:border-brass/50"
                  }`}
                >
                  {/* A little board: felt tray, two tiles, brass hardware. */}
                  <span
                    aria-hidden
                    className="flex h-12 items-end gap-1 rounded-md p-1.5"
                    style={{ backgroundColor: meta.swatch.felt }}
                  >
                    <span
                      className="h-full w-3 rounded-sm"
                      style={{ backgroundColor: meta.swatch.wood }}
                    />
                    <span
                      className="h-2/3 w-3 self-end rounded-sm"
                      style={{ backgroundColor: meta.swatch.wood, opacity: 0.5 }}
                    />
                    <span
                      className="ml-auto size-2 self-start rounded-full"
                      style={{ backgroundColor: meta.swatch.brass }}
                    />
                  </span>
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    {meta.name}
                    {selected && <Check aria-hidden size={14} />}
                  </span>
                  <span className="text-xs text-ink-muted">{meta.blurb}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">Lighting</h2>
        <div className="flex w-fit rounded-[var(--radius-control)] border border-line bg-surface p-1">
          {MODES.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              disabled={nightOnly}
              onClick={() => chooseMode(id)}
              className={`min-h-11 rounded-[calc(var(--radius-control)-0.25rem)] px-4 text-sm font-semibold capitalize transition-colors disabled:opacity-40 ${
                mode === id ? "bg-brass text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
        {nightOnly && (
          <p className="text-xs text-ink-muted">
            Neon night is always night.
          </p>
        )}
      </section>
    </div>
  );
}

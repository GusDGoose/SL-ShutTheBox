"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import {
  CLASSIC_THEMES,
  MODES,
  MODE_COOKIE,
  THEME_COOKIE,
  THEME_META,
  resolveMode,
  resolveTheme,
  serializeThemeCookie,
  type BoardTheme,
  type Mode,
  type Theme,
} from "@/lib/theme";
import { SEASONS } from "@/lib/seasons";
import {
  SKINS,
  SKIN_COOKIE,
  SKIN_META,
  resolveSkin,
  type SkinPick,
} from "@/lib/skins";
import { useSeasonEffects } from "@/components/shell/season-ambient";

// Both pickers write the cookie and stamp <html> in the same tick, so the board
// changes under your thumb with no server round trip and no flash.
function persist(name: string, value: string) {
  document.cookie = serializeThemeCookie(name, value);
}

function applyToDocument(theme: Theme, mode: Mode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const board = resolveTheme(theme);
  root.dataset.theme = board;
  root.dataset.themePick = theme;
  root.dataset.modePick = mode;
  root.dataset.mode = resolveMode(board, mode, prefersDark);
}

function applySkin(pick: SkinPick) {
  const root = document.documentElement;
  root.dataset.skinPick = pick;
  root.dataset.skin = resolveSkin(pick);
}

/** A little board: felt tray, two tiles, brass hardware, and its emoji. */
function Swatch({ board, tall = false }: { board: BoardTheme; tall?: boolean }) {
  const meta = THEME_META[board];
  return (
    <span
      aria-hidden
      className={`relative flex items-end gap-1 overflow-hidden rounded-md p-1.5 ${tall ? "h-20" : "h-12"}`}
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
        className="size-2 self-start rounded-full"
        style={{ backgroundColor: meta.swatch.brass }}
      />
      <span className={`ml-auto self-center ${tall ? "text-4xl" : "text-xl"}`}>
        {meta.emoji}
      </span>
    </span>
  );
}

function cardClass(selected: boolean) {
  return `flex w-full flex-col gap-2 rounded-[var(--radius-card)] border p-3 text-left transition-colors ${
    selected
      ? "border-brass bg-surface-2"
      : "border-line bg-surface hover:border-brass/50"
  }`;
}

export function AppearanceControls({
  initialTheme,
  initialMode,
  initialSkin,
}: {
  initialTheme: Theme;
  initialMode: Mode;
  initialSkin: SkinPick;
}) {
  const [skin, setSkin] = useState<SkinPick>(initialSkin);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [effects, setEffects] = useSeasonEffects();
  const board = resolveTheme(theme);
  const nightOnly = THEME_META[board].forcesDark;
  const today = THEME_META[resolveTheme("seasonal")];

  function chooseTheme(next: Theme) {
    setTheme(next);
    persist(THEME_COOKIE, next);
    applyToDocument(next, mode);
  }

  function chooseSkin(next: SkinPick) {
    setSkin(next);
    persist(SKIN_COOKIE, next);
    applySkin(next);
  }

  function chooseMode(next: Mode) {
    setMode(next);
    persist(MODE_COOKIE, next);
    applyToDocument(theme, next);
  }

  function boardCard(id: BoardTheme) {
    const meta = THEME_META[id];
    const selected = id === theme;
    return (
      <li key={id}>
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => chooseTheme(id)}
          className={cardClass(selected)}
        >
          <Swatch board={id} />
          <span className="flex items-center gap-1 text-sm font-semibold">
            {meta.name}
            {selected && <Check aria-hidden size={14} />}
          </span>
          <span className="text-xs text-ink-muted">
            {meta.season ? meta.season.when : meta.blurb}
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">Style</h2>
        <ul className="grid grid-cols-3 gap-3">
          {(["auto", ...SKINS] as SkinPick[]).map((id) => {
            const selected = id === skin;
            const meta =
              id === "auto"
                ? {
                    name: "Weekly",
                    blurb: `Takes turns every Monday. This week: ${SKIN_META[resolveSkin("auto")].name}.`,
                    emoji: "🔁",
                  }
                : SKIN_META[id];
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseSkin(id)}
                  className={cardClass(selected)}
                >
                  <span aria-hidden className="text-2xl">
                    {meta.emoji}
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
        <h2 className="eyebrow">Board</h2>
        <button
          type="button"
          aria-pressed={theme === "seasonal"}
          onClick={() => chooseTheme("seasonal")}
          className={cardClass(theme === "seasonal")}
        >
          <Swatch board={resolveTheme("seasonal")} tall />
          <span className="flex items-center gap-1 font-semibold">
            <Sparkles aria-hidden size={16} className="text-brass-ink" />
            Seasonal — follows the calendar
            {theme === "seasonal" && <Check aria-hidden size={14} />}
          </span>
          <span className="text-xs text-ink-muted">
            Right now: {today.emoji} {today.name}. A new board every month,
            and more for Påsk, Midsommar, Lucia, Christmas and New Year — with
            sounds to match.
          </span>
        </button>

        <h3 className="eyebrow mt-2">Classics</h3>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CLASSIC_THEMES.map(boardCard)}
        </ul>

        <h3 className="eyebrow mt-2">Pin a season</h3>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SEASONS.map(boardCard)}
        </ul>

        <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm font-semibold">
          <input
            type="checkbox"
            checked={effects}
            onChange={(e) => setEffects(e.target.checked)}
            className="size-5 accent-[var(--color-brass)]"
          />
          <span className="min-w-0 flex-1">
            Seasonal effects
            <span className="block text-xs font-normal text-ink-muted">
              Snow, leaves, fireworks and friends drifting over the app. This
              device only.
            </span>
          </span>
        </label>
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
                mode === id ? "bg-brass text-on-brass" : "text-ink-muted hover:text-ink"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
        {nightOnly && (
          <p className="text-xs text-ink-muted">
            {THEME_META[board].name} is always night.
          </p>
        )}
      </section>
    </div>
  );
}

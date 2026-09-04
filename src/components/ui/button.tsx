import type { ComponentProps } from "react";

// No "use client": with no hooks of its own this is a shared component, so it
// works in both server and client trees (a client parent can pass onClick).

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

// [concept: one primary button pattern] v1 repeated
// "bg-foreground text-background active:scale-95" across five files. Same idea,
// one place — brass hardware on wood.
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brass text-ink shadow-[var(--shadow-card)] hover:brightness-105 active:brightness-95",
  secondary:
    "border border-wood-dark/40 text-ink hover:bg-surface-2 active:bg-surface-2",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-2",
  danger: "bg-danger text-ivory hover:brightness-110 active:brightness-95",
};

const SIZES: Record<Size, string> = {
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-14 px-8 text-lg",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md") {
  return [
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)]",
    "font-semibold transition-all duration-[var(--duration-fast)]",
    "active:scale-[.97] disabled:pointer-events-none disabled:opacity-40",
    VARIANTS[variant],
    SIZES[size],
  ].join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={`${buttonClass(variant, size)} ${className}`}
      {...rest}
    />
  );
}

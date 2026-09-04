/**
 * A script that must run synchronously while the browser parses the HTML —
 * before the first paint — which is the only way to apply a stored theme
 * without a flash.
 *
 * [concept: server-only script type] React warns in development whenever a
 * component renders a <script>, because scripts inserted by later DOM updates
 * never execute. Rendering it as text/javascript on the server and text/plain
 * in the browser keeps the pre-paint behaviour on a hard load and silences the
 * warning; suppressHydrationWarning covers the type attribute differing.
 * This is the pattern in Next's "preventing flash before hydration" guide.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

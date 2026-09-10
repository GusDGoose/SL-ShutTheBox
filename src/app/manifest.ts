import type { MetadataRoute } from "next";

/**
 * The installable app.
 *
 * [concept: the manifest is fetched anonymously] The browser requests this
 * WITHOUT cookies, which is why proxy.ts exempts it — gated, it would
 * redirect to /pin and the install prompt would never appear. It is also why
 * theme_color is a hard-coded constant here rather than the current board's
 * wood: there is no session to read a theme from. generateViewport() in the
 * root layout still tints the browser chrome per theme once the app is open.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shut the Box",
    short_name: "Shut the Box",
    description:
      "Daily office Shut the Box — scores, streaks, and victory songs",
    start_url: "/",
    // Standalone so the tab bar sits at the bottom of the screen like an app's
    // rather than under a browser toolbar.
    display: "standalone",
    orientation: "portrait",
    background_color: "#F3ECDF",
    theme_color: "#7A5024",
    categories: ["games", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        // Android crops an icon to whatever shape the launcher uses, so the
        // maskable one is the same art inset into its safe zone on felt.
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Start a game", short_name: "Play", url: "/play" },
      { name: "Stats", short_name: "Stats", url: "/stats" },
    ],
  };
}

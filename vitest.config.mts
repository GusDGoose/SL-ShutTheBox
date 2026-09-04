import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// [concept: split test environments] Pure modules run in node (fast, no DOM
// shims); components need jsdom. Vitest 4 removed environmentMatchGlobs, so the
// split is expressed as two projects.
export default defineConfig({
  // Resolves the "@/*" alias from tsconfig.json natively (no plugin needed).
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "lib",
          environment: "node",
          include: ["src/lib/**/*.test.{ts,tsx}", "src/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "ui",
          environment: "jsdom",
          include: [
            "src/components/**/*.test.{ts,tsx}",
            "src/app/**/*.test.{ts,tsx}",
          ],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});

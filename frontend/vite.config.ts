import { resolve } from "node:path";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

// The app must be deployable at the site root or under a sub-path. The bundler,
// the router basename and the API client all read this same value, so a
// sub-path deploy never depends on rewriting URLs by hand.
const basePath = process.env["VITE_BASE_PATH"] ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    // Bundle budget is enforced by reading this report; it is written outside
    // dist/ so it is never published with the app. The path is resolved against
    // this file rather than the cwd, so building from the repo root (as the
    // evidence runner does) does not scatter the report elsewhere.
    visualizer({
      filename: resolve(import.meta.dirname, "bundle-report.html"),
      gzipSize: true,
    }),
  ],
  build: {
    // Fail loudly rather than silently shipping a chunk nobody measured.
    chunkSizeWarningLimit: 500,
    reportCompressedSize: true,
  },
  test: {
    // Os specs do Playwright vivem em e2e/ e rodam com o proprio runner dele;
    // sem esta exclusao o vitest tenta coleta-los e falha em test.describe.configure.
    exclude: ["node_modules/**", "dist/**", "e2e/**"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});

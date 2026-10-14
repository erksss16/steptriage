import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          markdown: ["react-markdown", "remark-gfm", "unified", "remark-parse"],
          validation: ["zod", "semver"],
          storage: ["dexie"],
        },
      },
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});

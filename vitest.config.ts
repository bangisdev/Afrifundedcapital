import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    hookTimeout: 15000,
    pool: "forks",
    singleFork: true,
    // Separate environments: server tests use node, frontend tests use jsdom
    environmentMatchGlobs: [
      ["src/server/__tests__/**", "node"],
      ["src/__tests__/**", "jsdom"],
    ],
    environment: "node",
    include: [
      "src/server/__tests__/**/*.test.ts",
      "src/__tests__/**/*.test.{ts,tsx}",
    ],
    setupFiles: ["src/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

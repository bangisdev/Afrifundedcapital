import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/server/__tests__/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Run tests sequentially to avoid DB conflicts
    pool: "forks",
    singleFork: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

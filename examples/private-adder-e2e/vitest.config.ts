import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 360_000,
    hookTimeout: 360_000,
  },
  resolve: {
    alias: {
      "@coti/pod-sdk": path.resolve(__dirname, "../../src/index.ts"),
    },
  },
});

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.integ.test.ts"],
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@coti/pod-sdk": path.resolve(__dirname, "src/index.ts"),
    },
  },
});

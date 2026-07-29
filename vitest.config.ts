import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {}
  },
  test: {
    include: ["packages/**/test/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});

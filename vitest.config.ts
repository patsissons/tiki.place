import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["sync/__tests__/**/*.test.ts", "lib/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
});

import { defineConfig } from "vitest/config";
import path from "node:path";
import "dotenv/config";

// .mts so the config is loaded as ESM: Vite's native config loader rejects ESM
// syntax in a file it treats as CommonJS, which a plain .ts here would be.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    fileParallelism: false, // integration tests share one database
    setupFiles: ["./tests/setup.ts"],
  },
});

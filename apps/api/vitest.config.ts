import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [
    {
      name: "assess-txt-loader",
      load(id) {
        if (id.endsWith(".txt")) {
          const contents = readFileSync(id, "utf8");
          return `export default ${JSON.stringify(contents)}`;
        }
      },
    },
  ],
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@assess/github": path.join(repoRoot, "packages/github/src/index.ts"),
      "@assess/signals": path.join(repoRoot, "packages/signals/src/index.ts"),
      "@assess/scoring": path.join(repoRoot, "packages/scoring/src/index.ts"),
    },
  },
});

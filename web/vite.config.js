import { defineConfig } from "vite";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";

// When deploying to GitHub Pages the page lives at /<repo>/.
// Set VITE_BASE env var to override (e.g. "/" for a custom domain or root deployment).
const base = process.env.VITE_BASE ?? "/camoes/";

// Collect all *.html files in the project root as entry points.
const htmlEntries = Object.fromEntries(
  readdirSync(import.meta.dirname)
    .filter((f) => f.endsWith(".html"))
    .map((f) => [f.replace(".html", ""), resolve(import.meta.dirname, f)])
);

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      input: htmlEntries,
    },
  },
});

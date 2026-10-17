import { defineConfig } from "vite";

// When deploying to GitHub Pages the page lives at /<repo>/.
// Set VITE_BASE env var to override (e.g. "/" for a custom domain or root deployment).
const base = process.env.VITE_BASE ?? "/camoes/";

export default defineConfig({
  base,
});

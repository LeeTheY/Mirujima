import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const productionOrigin = "https://mirujima.vercel.app/*";

export function externalMatchesForMode(mode: string): string[] {
  return mode === "development"
    ? [productionOrigin, "http://localhost:3000/*", "http://127.0.0.1:3000/*"]
    : [productionOrigin];
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: "mirujima-external-origins",
    async closeBundle() {
      const manifestPath = resolve(__dirname, "dist/manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
      manifest.externally_connectable = { matches: externalMatchesForMode(mode) };
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        sidepanel: resolve(__dirname, "sidepanel.html"),
        app: resolve(__dirname, "app.html"),
        blocked: resolve(__dirname, "blocked.html"),
        background: resolve(__dirname, "src/background/service-worker.ts"),
        content: resolve(__dirname, "src/content/index.ts")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
}));

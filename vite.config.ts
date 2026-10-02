import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const productionOrigin = "https://mirujima.vercel.app/*";

export function externalMatchesForMode(mode: string): string[] {
  return mode === "development"
    ? [productionOrigin, "http://localhost:3000/*", "http://127.0.0.1:3000/*"]
    : [productionOrigin];
}

export function extensionWebOriginForMode(mode: string, configuredOrigin?: string): string {
  if (mode !== "development") return productionOrigin.replace("/*", "");
  const origin = (configuredOrigin || "http://localhost:3000").replace(/\/$/, "");
  if (!externalMatchesForMode(mode).includes(`${origin}/*`)) throw new Error("개발 Web origin은 development manifest의 정확한 origin과 일치해야 합니다.");
  return origin;
}

export default defineConfig(({ mode }) => ({
  define: { "import.meta.env.VITE_WEB_APP_ORIGIN": JSON.stringify(extensionWebOriginForMode(mode, process.env.VITE_WEB_APP_ORIGIN ?? loadEnv(mode, process.cwd()).VITE_WEB_APP_ORIGIN)) },
  plugins: [react(), {
    name: "mirujima-external-origins",
    async closeBundle() {
      const manifestPath = resolve(__dirname, mode === "development" ? "dist-dev/manifest.json" : "dist/manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
      manifest.externally_connectable = { matches: externalMatchesForMode(mode) };
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }],
  build: {
    outDir: mode === "development" ? "dist-dev" : "dist",
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

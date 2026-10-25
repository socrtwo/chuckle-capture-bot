import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { MODEL_URLS } from "./src/lib/models";

/**
 * Injects the list of emitted build assets (hashed JS/CSS/images) and the
 * face-api model URLs into dist/sw.js so the service worker can precache
 * them at install time. public/sw.js carries empty placeholders.
 */
function swPrecacheManifest(): Plugin {
  let outDir = "dist";
  const assets = new Set<string>();

  return {
    name: "sw-precache-manifest",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (fileName === "sw.js" || fileName.endsWith(".map")) continue;
        assets.add(fileName);
      }
    },
    closeBundle() {
      const swPath = path.resolve(outDir, "sw.js");
      if (!fs.existsSync(swPath)) return;
      const manifest = Array.from(assets).sort();
      const sw = fs
        .readFileSync(swPath, "utf8")
        .replace(
          "self.__PRECACHE_MANIFEST = [];",
          `self.__PRECACHE_MANIFEST = ${JSON.stringify(manifest)};`
        )
        .replace(
          "self.__MODEL_URLS = [];",
          `self.__MODEL_URLS = ${JSON.stringify(MODEL_URLS)};`
        );
      fs.writeFileSync(swPath, sw);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: './',
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
    swPrecacheManifest(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Identifies this build. Baked into the bundle AND written to /version.json, so the running app can
 * ask the server "is there something newer than me?" by comparing two strings.
 */
const BUILD_ID = `${Date.now()}`;

/**
 * Publishes the build id as a tiny file the app polls.
 *
 * This is what makes an installed PWA update on its own. Without it the app has no way to know a
 * new deployment exists: it is a long-lived page on someone's phone that may not be reloaded for
 * weeks, which is why members were uninstalling and reinstalling to get new versions.
 */
function buildVersionFile(): Plugin {
  return {
    name: "dts-build-version",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ buildId: BUILD_ID, builtAt: new Date().toISOString() }),
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  envPrefix: ['VITE_', 'API_KEY_', 'GEMINI_'],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), buildVersionFile()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

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
  build: {
    /**
     * Split the big third-party libraries out of the app's own code.
     *
     * ── Why ──────────────────────────────────────────────────────────────────────────────────
     * Everything used to land in one file of about six megabytes, re-downloaded in full every time
     * a deployment changed a single line — because one changed line changes the file's hash, and
     * the hash is the whole file. Most of that weight is libraries that change only when we upgrade
     * them: Firebase, the charting library, the document writers, the animation engine.
     *
     * Pulled into their own chunks they are cached by the browser and survive our deployments, so
     * a routine release re-downloads the app's own code and nothing else. Combined with the
     * per-route chunks in App.tsx, a member opening their leads no longer downloads the ad
     * generator, the video-call stack or the PDF writer to get there.
     *
     * Grouped by what they are for, not one chunk per package: fifty tiny files cost more in
     * round-trips on a phone than they save in bytes.
     */
    rollupOptions: {
      output: {
        manualChunks: {
          // Only the two libraries every single screen needs are named here.
          //
          // Naming a chunk PULLS IT INTO THE ENTRY the moment anything eager touches one symbol
          // from it — which is how an earlier pass at this ended up preloading the PDF writer and
          // the charting library on the login screen. Everything else is left to rollup, which
          // places a library in the lazy route chunk that actually uses it, so a member who never
          // opens a chart never downloads one.
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-firebase": ["firebase/app", "firebase/auth", "firebase/firestore", "firebase/messaging"],
        },
      },
    },
    // The per-route chunks are all comfortably under this; the warning was about the old single
    // bundle and would otherwise keep firing on the vendor chunks, which are meant to be large.
    chunkSizeWarningLimit: 900,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

// THROWAWAY — browser verification harness for the AdGen studio. Delete after use.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify("verify") },
  server: { port: 8181, strictPort: true, hmr: false },
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@/services/geminiService", replacement: path.resolve(__dirname, "src/__verify__/fakeGemini.ts") },
      { find: "@/services/firebase", replacement: path.resolve(__dirname, "src/__verify__/fakeFirebase.ts") },
      { find: /^firebase\/firestore$/, replacement: path.resolve(__dirname, "src/__verify__/fakeFirestore.ts") },
      { find: "@", replacement: path.resolve(__dirname, "src") },
    ],
  },
});

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initCapacitorPlugins } from "@/services/capacitor-plugins";

// Initialize native Capacitor plugins (no-ops on web)
initCapacitorPlugins();

createRoot(document.getElementById("root")!).render(<App />);

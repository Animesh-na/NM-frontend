import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Local full-stack development (M7): DEV_API_PROXY=http://localhost:8090 serves
    // the API (incl. the calculation WebSocket) from this origin, with
    // VITE_MARINE_API_BASE=/api/v1. Off unless set.
    proxy: process.env.DEV_API_PROXY
      ? { "/api": { target: process.env.DEV_API_PROXY, ws: true, changeOrigin: false } }
      : undefined,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

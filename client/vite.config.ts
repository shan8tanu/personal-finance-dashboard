import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In production the frontend is served by Express on the same origin,
// so all /api/* calls are same-origin — no proxy or absolute URL needed.
// VITE_API_URL can be set to point at a different host during local dev if needed.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": process.env.VITE_API_URL || "http://localhost:3001",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: mode !== "production",
  },
}));

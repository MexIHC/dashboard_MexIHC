import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Evita que en Windows solo quede escuchando en [::1]: si abres http://127.0.0.1:5173 no conecta.
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8002",
        changeOrigin: true,
      },
    },
  },
  // Mismo proxy que en `npm run dev`: si sirves `dist` con `vite preview`, las peticiones a /api siguen al backend.
  preview: {
    host: true,
    port: 4173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8002",
        changeOrigin: true,
      },
    },
  },
});

import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "/static/lyrics-shader-lab/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(projectDir, "src"),
    },
  },
  build: {
    outDir: path.resolve(projectDir, "../static/lyrics-shader-lab"),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/stream": "http://127.0.0.1:8000",
    },
  },
});


import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/AETHERON/",
  build: {
    chunkSizeWarningLimit: 1000
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001"
    }
  }
});

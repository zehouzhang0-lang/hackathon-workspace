import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: {
      "/moneyai": {
        target: "http://127.0.0.1:31416",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/moneyai/, ""),
      },
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
    proxy: {
      "/moneyai": {
        target: "http://127.0.0.1:31416",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/moneyai/, ""),
      },
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "app",
  base: "./",
  server: { 
    host: true, 
    port: 3000,
    watch: {
      usePolling: true
    },
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        rewrite: (path) => path
      }
    }
  },
  preview: { host: true, port: 3000 },
});


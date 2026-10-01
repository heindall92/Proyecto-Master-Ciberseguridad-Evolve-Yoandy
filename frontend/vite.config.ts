import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "app",
  base: "./",
  server: { 
    host: true, 
    port: 3000,
    // HTTPS por la VPN: `tailscale serve` publica https://<máquina>.<tailnet>.ts.net con certificado válido
    allowedHosts: [".ts.net"],
    watch: {
      usePolling: true
    },
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        xfwd: true, // reenvía la IP real del cliente (X-Forwarded-For) al backend
        rewrite: (path) => path
      },
      '/ws': {
        target: 'ws://backend:8000',
        ws: true,
        changeOrigin: true,
        xfwd: true
      }
    }
  },
  optimizeDeps: {
    include: ["framer-motion"]
  },
  preview: { host: true, port: 3000 },
  // Pruebas unitarias de la consola (Vitest + Testing Library): `npm test`
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/store/**", "src/ui/premium/widgets.tsx"],
      reporter: ["text", "html"],
      reportsDirectory: "../coverage",
    },
  },
});


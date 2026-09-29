import { defineConfig } from 'vite';
import type { ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: { env: Record<string, string | undefined> };

const apiProxy: ProxyOptions = {
  target: process.env.EASYLEDGER_API_PROXY_TARGET ?? 'http://127.0.0.1:3000',
  changeOrigin: true,
  configure: (proxy) => {
    // These requests are same-origin from the browser's point of view. Strip
    // the browser Origin before proxying so Vite's fallback port remains usable
    // without widening the API's exact development/production CORS allowlist.
    proxy.on('proxyReq', (proxyRequest) => proxyRequest.removeHeader('origin'));
    proxy.on('error', (_err, _req, res) => {
      if (!res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 'BACKEND_UNAVAILABLE', message: 'EasyLedger API is unavailable. Start the API with the local app command and check PostgreSQL.' }));
      }
    });
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': apiProxy,
      '/health': apiProxy,
    },
  },
});

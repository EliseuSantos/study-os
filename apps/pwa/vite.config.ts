import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// LAB_DEV=1: dev server reachable through the homelab proxy (https://study-os.lan
// → vite on :8788) with HMR over the proxy's TLS websocket.
const labDev = process.env.LAB_DEV === '1';
// Inside the lab docker network the worker is the `study-os` service, not localhost.
const workerTarget = process.env.WORKER_ORIGIN ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    // Dev-only escape hatch: GET /__reset makes the browser wipe this origin's
    // storage (OPFS included) even when open access handles block deletion.
    {
      name: 'lab-reset-storage',
      configureServer(server) {
        server.middlewares.use('/__reset', (_req, res) => {
          res.setHeader('Clear-Site-Data', '"storage"');
          res.setHeader('content-type', 'text/plain; charset=utf-8');
          res.end('storage da origem limpo — volte ao app.');
        });
      },
    },
  ],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@journeyapps/wa-sqlite'] },
  server: {
    proxy: {
      '/sync': workerTarget,
      '/proxy': workerTarget,
      '/health': workerTarget,
      '/share': workerTarget,
    },
    ...(labDev
      ? {
          host: '0.0.0.0',
          port: 8788,
          strictPort: true,
          allowedHosts: ['study-os.lan'],
          // inotify misses writes through the docker bind mount — poll instead
          watch: { usePolling: true, interval: 400 },
          // ws over the proxy's port 80: the page is browsed over http and the
          // self-signed cert blocks wss (websockets have no cert interstitial)
          hmr: { protocol: 'ws', host: 'study-os.lan', clientPort: 80 },
        }
      : {}),
  },
  // the e2e target (vite preview) needs the same worker proxies as dev
  preview: {
    proxy: {
      '/sync': workerTarget,
      '/proxy': workerTarget,
      '/health': workerTarget,
      '/share': workerTarget,
    },
  },
});

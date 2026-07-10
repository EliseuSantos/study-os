import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@journeyapps/wa-sqlite'] },
  server: {
    proxy: {
      '/sync': 'http://localhost:8787',
      '/health': 'http://localhost:8787',
    },
  },
});

import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // prerendered pages are real files; 200.html is the SPA fallback the
    // worker serves for dynamic-param routes (see wrangler.jsonc)
    adapter: adapter({ fallback: '200.html' }),
  },
};

export default config;

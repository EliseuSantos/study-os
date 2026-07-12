// The shell prerenders at build time (real HTML on first paint); every page
// still hydrates into a full client-side app over the local db. Routes with
// dynamic params keep falling back to the SPA index.html.
export const ssr = true;
export const prerender = true;
export const csr = true;

import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4173',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
  },
  video: false,
  retries: {
    runMode: 2,
    openMode: 0,
  },
  viewportWidth: 1180,
  viewportHeight: 800,
});

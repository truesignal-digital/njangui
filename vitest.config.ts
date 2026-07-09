import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['convex/**/*.integration.test.ts'],
    environment: 'edge-runtime',
  },
});

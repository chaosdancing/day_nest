import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ['tests/helpers/setup.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});

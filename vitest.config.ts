import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/crypto/**', 'src/db/schema.ts', 'src/db/hooks.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});

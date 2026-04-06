import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [
      ['src/__tests__/ui/**', 'happy-dom'],
    ],
    setupFiles: ['src/__tests__/ui/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/crypto/**', 'src/db/schema.ts', 'src/db/hooks.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});

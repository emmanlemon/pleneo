import path from 'node:path';
import { defineConfig } from 'vitest/config';

const src = (p) => path.resolve(import.meta.dirname, 'src', p);

export default defineConfig({
  resolve: {
    alias: [
      { find: '#config', replacement: src('config/index.js') },
      { find: /^#common\/(.*)$/, replacement: `${src('common')}/$1` },
      { find: /^#infra\/(.*)$/, replacement: `${src('infrastructure')}/$1` },
      { find: /^#modules\/(.*)$/, replacement: `${src('modules')}/$1` },
    ],
  },
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.js'],
    include: ['**/*.test.js'],
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/server.js', 'src/infrastructure/database/migrate.js'],
      reporter: ['text', 'lcov'],
    },
  },
});

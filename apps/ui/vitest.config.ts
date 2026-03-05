import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@iexcel/shared-types': path.resolve(
        __dirname,
        '../../packages/shared-types/src/index.ts'
      ),
      '@iexcel/api-client': path.resolve(
        __dirname,
        '../../packages/api-client/src/index.ts'
      ),
    },
  },
});

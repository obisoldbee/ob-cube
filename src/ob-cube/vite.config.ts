/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    // PRD §11 性能 / D9：把 three 与 addons 拆成独立 chunk，避免单包超过 500KB
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/puzzle/**', 'src/challenge/**'],
      reporter: ['text', 'json-summary'],
      // PRD execution/verification.md §11.1 的覆盖率门禁（D10）
      thresholds: {
        'src/engine/**': { lines: 95 },
        'src/challenge/**': { lines: 85 },
      },
    },
  },
});

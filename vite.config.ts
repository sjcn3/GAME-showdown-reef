/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相对路径，便于直接丢到任意静态目录 / 手机本地打开
  base: './',
  server: {
    host: true,
    port: 5180,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

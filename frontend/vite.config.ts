import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'size-sensor': fileURLToPath(new URL('./src/vendor/size-sensor.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/hooks/**', 'src/utils/**'],
      exclude: [
        'src/hooks/index.ts',
        'src/App.tsx',
        'src/main.tsx',
        'src/pages/**',
        'src/components/**',
        'src/services/**',
        'src/context/**',
        '**/*.d.ts',
      ],
    },
  },
})

import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // Test files location
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', '__tests__/**/*.test.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/__tests__/**',
        'node_modules/**',
      ],
      thresholds: {
        // MVP thresholds — increase over time
        statements: 50,
        branches: 40,
        functions: 50,
        lines: 50,
      },
    },

    // Environment
    environment: 'node',
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})

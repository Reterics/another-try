import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'GameUI',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['preact', '@preact/signals', '@game/shared'],
      output: {
        globals: {
          preact: 'preact',
          '@preact/signals': 'signals',
          '@game/shared': 'GameShared',
        },
      },
    },
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@game/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});

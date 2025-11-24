import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  plugins: [
    svelte(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: [
                'node-llama-cpp',
                '@node-llama-cpp/mac-x64',
                '@node-llama-cpp/mac-arm64',
                '@node-llama-cpp/linux-x64',
                '@node-llama-cpp/linux-arm64',
                '@node-llama-cpp/win32-x64'
              ]
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          // Don't reload app when preload changes
          args.reload()
        },
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs', // Use CommonJS format for preload script
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
})

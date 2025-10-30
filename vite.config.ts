import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    electron([
      {
        entry: 'electron/main.ts',
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

import react from '@vitejs/plugin-react'
import jotaiDebugLabel from 'jotai/babel/plugin-debug-label'
import jotaiReactRefresh from 'jotai/babel/plugin-react-refresh'
import path from 'path'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      tsconfigPaths(),
      react({
        babel: {
          plugins: [jotaiDebugLabel, jotaiReactRefresh],
        },
      }),
    ],
    resolve: {
      alias: {
        'webextension-polyfill': path.resolve(__dirname, 'src/webextension-polyfill.web.ts'),
      },
    },
    build: {
      rollupOptions: {
        input: ['app.html'],
      },
      outDir: 'dist-web',
    },
    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
    server: {
      strictPort: true,
      port: 5174,
    },
  }
})

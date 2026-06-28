import path from 'path'
import react from '@vitejs/plugin-react'
import jotaiDebugLabel from 'jotai/babel/plugin-debug-label'
import jotaiReactRefresh from 'jotai/babel/plugin-react-refresh'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import pkg from './package.json'

export default defineConfig(({ mode }) => {
  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
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
    optimizeDeps: {
      include: ['framer-motion'],
    },
    build: {
      rollupOptions: {
        input: ['index.html'],
      },
    },
    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
    server: {
      strictPort: true,
      port: 5173,
      hmr: {
        clientPort: 5173,
      },
    },
  }
})

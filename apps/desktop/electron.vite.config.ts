import { defineConfig } from "electron-vite";
import { resolve } from "node:path";

/**
 * electron-vite resuelve por nosotros la parte del armazón que es fácil de
 * equivocar: el proceso principal como ESM, el preload como CommonJS —los
 * preloads con sandbox NO admiten ESM— y el renderer como una página normal.
 */
export default defineConfig({
  main: {
    build: {
      lib: { entry: resolve(__dirname, "src/main/index.ts") },
      rollupOptions: { output: { format: "es" } },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        // DOS preloads: uno para la vista del proveedor y otro para la
        // interfaz propia. CommonJS a propósito — los preloads con sandbox
        // no admiten ESM.
        input: {
          provider: resolve(__dirname, "src/preload/provider.ts"),
          ui: resolve(__dirname, "src/preload/ui.ts"),
        },
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    build: {
      rollupOptions: { input: resolve(__dirname, "src/renderer/index.html") },
    },
  },
});

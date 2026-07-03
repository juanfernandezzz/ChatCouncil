# entrypoints/

- `background.ts` — service worker MV3. Unico punto de entrada del
  puente (Q7/Q9): escucha `runtime.onConnectExternal`, resuelve el
  handshake, y en Fases 2/3 despachara `byok:proxy` y `byoa:dispatch`.

- **No hay `content.ts` todavia, a proposito.** Cada adaptador de
  estrategia `dom` (Q1) necesitara su propio content script acotado
  SOLO al dominio de ese proveedor (ej. `chatgpt.content.ts` con
  `matches: ["https://chatgpt.com/*"]`), una vez que ese proveedor haya
  sido investigado y su `AdapterDescriptor` en
  `packages/shared/src/adapter-contract.ts` haya salido de
  `"pending-reverse-engineering"`. Escribir un content script generico
  con selectores inventados no aporta nada real y se descarto adrede
  (ver docs/BLUEPRINT.md, Fase 3).

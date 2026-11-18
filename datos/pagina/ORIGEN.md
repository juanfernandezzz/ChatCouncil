# Origen de pagina.js (DAT-003)

- Repo: ChatCouncil-Unity (ChatCouncil-main), tag `referencia-port-chatcouncil`, commit 953fbbc (ADR-0009).
- Fuente: `pagina/src/pagina.ts` (sha256 fd9e6333e00402ee29c2e90da0e5c21b0ce87e77c107fb30e8e3e2a375d44aa1) con `pagina/tsconfig.json`.
- En la Unity, `pagina.js` no se versiona (D57): `scripts/unity/compilar-app.ps1` lo genera en `unity/Assets/StreamingAssets/pagina.js` y `Paneles.cs` lo lee de ahí (`Nativo.LeerStreamingAsset("pagina.js")`) y lo ejecuta con `ExecuteScript` cuando la página no lo tiene, antes de cada operación.
- Compilación, sobre una copia en `C:\cc-target\tmp\pagina-unity` (nunca dentro de ChatCouncil-main), con la versión que fija la Unity, desde la carpeta de la copia:

      npx --yes -p typescript@7.0.2 tsc -p pagina

  (Node v24.16.0; código de salida 0.)
- Resultado: `pagina.js`, 19.301 bytes, saltos LF, sha256 39b048ce1545cf1d6fcb16f3c4e55f65c882d9cd9dc0d1dea261ed8daec15161. Es el mismo sha256 que el `unity/Assets/StreamingAssets/pagina.js` que la Unity compiló en su carpeta.
- No se modifica. La prueba `pagina_js_es_identico_al_de_la_unity` de crates/paneles compara este sha256.

# Origen de enviar.js (ESC-016, ADR-0011)

- Nuevo en este repo, no viene de la Unity: la Unity no envía. Escrito a mano en JavaScript (PART-021, D33).
- Usa las funciones de `pagina.js` (`leerCompositor`, `chatVacio`, `buscar`, `buscarTodos`, `dormir`), que se inyecta antes; sin ellas no envía.
- sha256 1f14adcf851139012ac2785fc3d9e5685e33615720e109f28a84f4510822b938 (PART-021). `crates/paneles` lo incluye con `include_str!`; el instalador no cambia.

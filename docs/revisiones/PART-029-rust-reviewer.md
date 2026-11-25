# PART-029 · revisión independiente (ecc:rust-reviewer) y qué se hizo

Alcance: puerta.rs (sin_invocaciones_de_skill y R18), enviar.js (sinSkill) y pruebaronda.rs. El revisor solo leyó el diff; no compiló.

1. Media, enviar.js: sinSkill solo se aplicaba al compositor; una pregunta que empieza con «@algo» o «/algo» no coincidía. APLICADO: se acepta el compositor tal cual o sin la invocación (los dos puntos de comparación).
2. Media, puerta.rs aviso_prompts_de_captura: misma asimetría con la pregunta. APLICADO: el mensaje cuenta si coincide tal cual o sin la invocación; prueba nueva con una pregunta que empieza con «@ana».
3. Baja, espacios: trim_start/is_whitespace de Rust incluyen U+0085 y excluyen U+FEFF; \s de JS al revés. SIN CAMBIO: ningún caso deja enviar un texto distinto; un BOM o NEL al comienzo del compositor es improbable.
4. Baja, Unicode del nombre: is_alphanumeric de Rust es Alphabetic o Numeric. APLICADO: el JS usa \p{Alphabetic}\p{N}. Prueba con «/investigación ».
5. Informativa: se pueden enviar textos con «/clear » o «@alguien » delante, sin límite de tokens. SIN CAMBIO, por diseño del lote (D46.3: uno o más tokens); en el informe como riesgo. Una lista de skills conocidas lo cerraría, pero el diagnóstico no la justificó.
6. Baja, pruebas: faltaban una pregunta que empieza con «@», un nombre con acento y una prueba unitaria del JS. APLICADO lo de Rust; el JS se probó con los mismos 10 vectores en node (sin archivo de pruebas nuevo en el repo) y lo cubre pruebaronda con ChatGPT.

No revisado por el agente: pruebaronda.rs a fondo y la ejecución. Esas las cubren los gates: cargo test, autoprueba 66/66, pruebaronda 103/103 y pruebainterfaz 16/9/13 sobre el código final (ver PLAN_EVIDENCE.md#PART-029).

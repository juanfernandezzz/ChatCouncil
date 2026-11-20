# PART-021 · Revisión ecc:rust-reviewer · PR #1 (ba0da36..0b47cd6)

Fecha: 2026-11-20. Solo lectura; el revisor no compiló ni corrió cargo. Los números de línea salen del árbol de trabajo, que tenía cambios sin commit en interfaz.rs y ventana.rs; pueden desviarse unas líneas de 0b47cd6.

## 1. Hallazgos 1–4: corregidos

1. CORREGIDO. Comprobación de que el compositor tiene el texto pegado antes del clic: datos/pagina/enviar.js:17-19 (compositor-vacio, compositor-distinto), repetida en :43 justo antes de boton.click(); guarda ya-enviado en :20.
2. CORREGIDO. Un error también marca el panel como pulsado: crates/app/src/interfaz.rs:1883-1886 y :1871; anotar_pegado (:145-149) limpia con un pegado nuevo. Ver hallazgo 6: quedó demasiado ancho.
3. CORREGIDO. Espera del botón con tope de 15 s: enviar.js:32 y COMPROBAR_MS = 15000 (:9, :53). Peor caso 30 s frente a ESPERA_ENVIAR de 40 s (crates/paneles/src/lib.rs:29).
4. CORREGIDO. Error explícito si no se sabe qué se pegó: interfaz.rs:1855-1857; el orden (None, _) y (_, None) cubre todos los casos.

Sin pánicos ni préstamos problemáticos: ningún borrow() de RefCell cruza un await; ids[0] solo con n == 1 y ids no vacío; enviar.js no toca cookies, localStorage ni sessionStorage; el único llamador de pulsar_enviar es enviar_a_todos, alcanzable solo desde el «Sí, enviar».

## 2. Hallazgos pendientes (no corregidos en este lote)

5. MEDIA. interfaz.rs:1779, 1783, 1794. «Enviar a todos» suelta `ocupar` antes del await de estados (:1784): un doble clic abre dos tareas, la segunda reemplaza al_aceptar y el «Sí» de la primera queda huérfano; si el «Sí» llega con ocupado, tomar() devuelve None sin mensaje (:1807, 2096-2108). Sugerido: mantener ocupado hasta antes de abrir_dialogo y soltarlo en cada return temprano.
6. MEDIA-BAJA. interfaz.rs:1883-1886. Todo Err marca el panel como pulsado, incluso los previos al clic (panel no abierto, no se sabe qué se pegó, guarda de host de pruebas, spec vacía, pagina.js sin cargar). El panel deja de ofrecerse en «Enviar a todos» (filtro :1787) hasta un pegado nuevo o envío a mano. Sugerido: marcar solo los errores posteriores al pedido.
7. MEDIA-BAJA. interfaz.rs:1898-1908. Un panel pulsado sin comprobar no cuenta en ok y el resumen dice «envíalos a mano», contra la cabecera («míralo antes de volver a enviar»): riesgo de doble envío. El test pruebaronda.rs:559-579 fija ese texto. Sugerido: contar aparte los «pulsados sin comprobar».
8. BAJA. crates/paneles/src/lib.rs:1915-1966. La prueba la_app_envia_solo_con_confirmacion usa include_str! de una lista cerrada de archivos, recorta en el primer #[cfg(test)] y busca «Sí, enviar» en texto; un archivo nuevo que llame a pulsar_enviar no se detectaría. pulsar_enviar es pub.
9. BAJA. pruebaronda.rs:583-587. El resultado de hasta(60, ...) se descarta; la prueba «sin comprobar no se reintenta» pasaría aunque el segundo envío no corriera.
10. BAJA. paneles/src/lib.rs:748-757 y enviar.js:6. Un window.__ccEnviar definido por la página se acepta sin comprobar (igual que __cc; no es regresión del PR).
11. BAJA. enviar.js:25-27. Con submit.kind == "key" se envía siempre Enter y se ignora spec.submit.key; buscar(...) puede devolver null y c.focus() lanzaría TypeError (acaba marcado pulsado, ver 6). Hoy solo Kimi usa Enter.
12. BAJA. enviar.js:11-12 y :21. El Map pedidos no se vacía si Rust vence a los 40 s; chatVacio depende de userMessage.selector.
13. BAJA. ventana.rs, FocusScope de la capa. Esc equivale ahora a «Cancelar» en todos los diálogos de ronda, no solo en «Enviar a todos»; verificar con la referencia Unity.

## 3. Veredicto del revisor

BLOQUEA (sobre el PR #1 tal como se revisó): 5 y 7, más el 6. El PR ya está mergeado. Por D34.8 los hallazgos 5–7 se reportan y no se corrigen en este lote.

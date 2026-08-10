/**
 * @chatcouncil/analysis — núcleo de análisis, PORTABLE
 * ----------------------------------------------------
 * Sin dependencias de Electron, del DOM ni del sistema operativo. Es lo que
 * permite que un armazón futuro para tablet reutilice el dominio en vez de
 * reescribirlo (BLUEPRINT §3).
 *
 * Contiene el único material de la v2 que se rescató tal cual, porque estaba
 * fundado y verificado:
 *  · `anonymize` — etiquetas sin identidad, sello aparte, scrub de términos
 *    identificatorios DEL CONTENIDO, y barajado con semilla para que la
 *    posición no filtre la identidad del proveedor.
 *  · `build-analyst-prompt` — **no tiene NINGÚN import, y es a propósito**: es
 *    la garantía estructural de que la identidad del proveedor no tiene por
 *    dónde entrar al prompt que reciben los ANALISTAS. Verificado por
 *    `guard:sellado` en CI. Agregarle un import rompe la garantía, no sólo el
 *    estilo.
 */
export * from "./anonymize";
export * from "./build-analyst-prompt";
export * from "./provider-names";

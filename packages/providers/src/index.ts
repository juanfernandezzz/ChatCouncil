/**
 * @chatcouncil/providers — conocimiento del DOM ajeno, PORTABLE
 * --------------------------------------------------------------
 * `specs.json` contiene los selectores derivados del DOM real de cada
 * proveedor y validados en el navegador de Juan durante la v2. Sobreviven a
 * la reconstrucción porque describen las páginas de OTROS, no nuestro
 * armazón.
 *
 * DOS COSAS APRENDIDAS que conviene tener presentes al agregar un proveedor
 * (BLUEPRINT §7):
 *  · El selector "obvio" suele venir con ruido estructural. ChatGPT envolvía
 *    en una clase de presentación que después dejó de usar; GLM mete el
 *    bloque de razonamiento DENTRO del contenedor de la respuesta. De ahí
 *    `exclude`.
 *  · Estos selectores CADUCAN. Su lugar natural es un manifiesto editable,
 *    no una constante compilada.
 *  · **Los selectores por `aria-label` son LOCALIZADOS.** GLM pasó la Fase 0
 *    con `[aria-label="Stop"]` porque esa cuenta está en inglés; con la
 *    interfaz en español ese selector no matchea nada y el síntoma se parece
 *    a un fallo del armazón. Preferir `id` y `data-testid`, que son estables,
 *    y si no hay más remedio que usar `aria-label`, dejar anotado el idioma
 *    de la cuenta con la que se derivó.
 */
import raw from "./specs.json" with { type: "json" };

export const PROVIDER_SPECS = raw.specs;
export type ProviderId = keyof typeof PROVIDER_SPECS;

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
 */
import raw from "./specs.json" with { type: "json" };

export const PROVIDER_SPECS = raw.specs;
export type ProviderId = keyof typeof PROVIDER_SPECS;

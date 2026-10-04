/**
 * comprobar-urls.ts — 7-1-1 (2026-09-29): comprobación MECÁNICA de las URLs
 * que el verificador citó en su sección 1 (CONFIRMA / CONTRADICE).
 * ------------------------------------------------------------------------
 * El ÚNICO lugar de la app que sale a la red por su cuenta. Vive acá y no en
 * `packages/analysis` porque `guard:dominio` mantiene ese paquete sin red; y
 * hasta este archivo no había otro: el puerto HTTP real de T2 quedó ABIERTO
 * (BLUEPRINT, "T2, cerrada").
 *
 * Límites, todos duros:
 *  · Sólo abre URLs que el verificador escribió en la sección 1 — nunca
 *    busca nada por su cuenta, nunca las de la sección 2.
 *  · Techo de 20 URLs por ronda y 10 s por URL (HEAD y, si falla, GET,
 *    dentro de los mismos 10 s).
 *  · La petición no lleva nada de Juan: el `fetch` de Node no comparte
 *    cookies ni sesión con los paneles, y no se le agrega ninguna cabecera.
 *    Del GET no se lee el cuerpo: se cancela apenas llega el estado.
 *
 * Esto NO decide si la fuente sostiene la afirmación — eso no se puede
 * mecanizar —: sólo si la URL existe y responde. Una URL inventada se cae acá.
 */

import type { SalidaVerificador, UrlComprobada } from "@chatcouncil/domain";
import { parsearVerificacion, textoDeLaSalidaVerificador } from "@chatcouncil/analysis";

import { escribirUrlComprobada, leerRegistroDeArchivo } from "./registro";

export const TECHO_URLS_POR_RONDA = 20;
export const TIMEOUT_POR_URL_MS = 10_000;

export interface ResultadoUrl {
  codigo: number | null;
  detalle: string | null;
}

type Fetch = typeof fetch;

/** HEAD; si HEAD no llega o responde error, GET. Un solo reloj de 10 s para las dos. */
export async function comprobarUrl(url: string, pedir: Fetch = fetch, timeoutMs = TIMEOUT_POR_URL_MS): Promise<ResultadoUrl> {
  const signal = AbortSignal.timeout(timeoutMs);
  const sinRespuesta = { codigo: null, detalle: `sin respuesta en ${timeoutMs / 1000} s` };
  try {
    const head = await pedir(url, { method: "HEAD", redirect: "follow", signal });
    if (head.ok) return { codigo: head.status, detalle: null };
  } catch {
    if (signal.aborted) return sinRespuesta;
  }
  try {
    const get = await pedir(url, { method: "GET", redirect: "follow", signal });
    await get.body?.cancel();
    return { codigo: get.status, detalle: null };
  } catch (e) {
    if (signal.aborted) return sinRespuesta;
    const causa = (e as { cause?: { code?: string } }).cause?.code;
    return { codigo: null, detalle: causa ?? (e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Comprueba las URLs de la sección 1 de la ÚLTIMA verificación capturada de la
 * ronda y las registra como `UrlComprobada`. Si esa verificación ya se
 * comprobó, devuelve lo registrado sin volver a salir a la red.
 */
export async function comprobarUrlsDeRonda(
  userData: string,
  conversacionId: string,
  rondaId: string,
  pedir: Fetch = fetch,
): Promise<{ ok: true; salidaVerificadorId: string; urls: UrlComprobada[]; yaComprobadas: boolean } | { ok: false; error: string }> {
  const hechos = leerRegistroDeArchivo(userData, conversacionId).hechos;
  const salidas = hechos.filter((h): h is SalidaVerificador => h.tipo === "salida-verificador" && h.rondaId === rondaId);
  const salida = salidas[salidas.length - 1];
  if (!salida) return { ok: false, error: `la ronda ${rondaId} no tiene verificacion capturada` };
  const previas = hechos.filter((h): h is UrlComprobada => h.tipo === "url-comprobada" && h.salidaVerificadorId === salida.id);
  if (previas.length > 0) return { ok: true, salidaVerificadorId: salida.id, urls: previas, yaComprobadas: true };

  const urls = [
    ...new Set(
      parsearVerificacion(textoDeLaSalidaVerificador(salida), [])
        .correspondencias.filter((v) => v.correspondencia !== "NO_ENCONTRADA" && v.url !== null)
        .map((v) => v.url as string),
    ),
  ].slice(0, TECHO_URLS_POR_RONDA);

  const resultados = await Promise.all(urls.map(async (url) => ({ url, ...(await comprobarUrl(url, pedir)) })));
  const escritas = resultados.map((r) =>
    escribirUrlComprobada(userData, conversacionId, {
      rondaId,
      salidaVerificadorId: salida.id,
      url: r.url,
      codigo: r.codigo,
      detalle: r.detalle,
      comprobadaEn: new Date().toISOString(),
    }),
  );
  return { ok: true, salidaVerificadorId: salida.id, urls: escritas, yaComprobadas: false };
}

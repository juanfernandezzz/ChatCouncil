/**
 * Hook de resolución ESM para los gates que necesitan importar un .ts del
 * repo directo (sin build previo). El código del repo usa especificadores
 * SIN extensión ("./anonymize") porque `moduleResolution: "bundler"` (tsc,
 * vite) lo resuelve así — pero el resolvedor NATIVO de Node no: sin este
 * hook, `import("./anonymize")` desde un .ts falla con MODULE_NOT_FOUND
 * apenas ese .ts tiene, a su vez, un import relativo propio.
 *
 * Sólo agrega ".ts" como reintento cuando la resolución normal falla, y
 * sólo para especificadores relativos ("./" o "../") sin extensión ya
 * puesta — no toca nada más.
 */
export async function resolve(specifier, context, nextResolve) {
  const esRelativoSinExtension =
    (specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-zA-Z0-9]+$/.test(specifier);
  if (!esRelativoSinExtension) return nextResolve(specifier, context);
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err?.code !== "ERR_MODULE_NOT_FOUND") throw err;
    return nextResolve(specifier + ".ts", context);
  }
}

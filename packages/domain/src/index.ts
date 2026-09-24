/**
 * MODELO DE DATOS — Fase 2.
 *
 * TypeScript puro. Sin Electron, sin DOM, sin `node:*`. Esa restricción no es
 * estética: es lo que hace que el modelo pueda irse a otro lado sin arrastrar
 * la aplicación de escritorio detrás (§4), y `guard:dominio` la sostiene con
 * un mecanismo en vez de con una nota de intención.
 *
 * FORMATO: una línea de JSON por hecho, en un archivo por conversación
 * (decisión 1 de la Fase 2). Append-only. Nunca se reescribe una línea ya
 * escrita: el original es el dato canónico, y lo que se corrige se corrige
 * agregando, no pisando.
 */

export const VERSION_ESQUEMA = 1;

/**
 * De dónde salió el fin de una respuesta, y con qué confianza se leyó.
 *
 * Esto es lo que distingue esta fase de "guardar el texto". Una respuesta
 * guardada sin saber si su fin se OBSERVÓ o se DEDUJO es una respuesta de
 * procedencia desconocida, y seis meses después no hay forma de saber si era
 * corta o si estaba truncada (§7.9).
 */
export interface Procedencia {
  /** Etiqueta de modelo leída de la interfaz. `null` = el proveedor no la expone. */
  modelLabel: string | null;
  /** Cuándo se leyó esa etiqueta. Sin esto no se puede fechar una deriva de versión. */
  modelLabelLeidaEn: string | null;
  /** `observado` = un indicador lo dijo. `inferido` = sólo se dedujo de la quietud. */
  finDe: "observado" | "inferido";
  /** La ventana de quietud VIGENTE en esa lectura, no la de hoy. */
  quiescenceMs: number | null;
  /** `true` generando, `false` terminado, **`null` no observable**. El null viaja al disco. */
  generandoAlLeer: boolean | null;
  /** Estado del hilo, derivado de hechos del proceso, no del texto. */
  continuidad: "confirmada" | "refutada" | "indeterminada";
  /** Con qué método entró el texto en el compositor. */
  metodoEscritura: "execCommand" | "paste" | "textContent" | null;
  /** Ancho x alto del panel al leer: es variable de la prueba, no adorno (§7.29). */
  panel: string | null;
}

export interface Conversacion {
  tipo: "conversacion";
  esquema: number;
  id: string;
  creadaEn: string;
  titulo: string | null;
  /** Corrida del arnés, no uso real. Se marca para poder excluirla del análisis. */
  esPrueba: boolean;
}

export interface Ronda {
  tipo: "ronda";
  esquema: number;
  id: string;
  conversacionId: string;
  indice: number;
  prompt: string;
  enviadaEn: string;
  /**
   * Semilla del barajado. La usa la Fase 3, y se guarda desde ya: agregarla
   * después obliga a migrar el registro entero.
   */
  semilla: string | null;
}

/**
 * Un INTENTO de envío. Va separado de la respuesta a propósito: un envío que
 * falla es un hecho, y hoy se pierde entero.
 */
export interface Intento {
  tipo: "intento";
  esquema: number;
  id: string;
  rondaId: string;
  proveedorId: string;
  ok: boolean;
  error: string | null;
  enviadoEn: string;
}

export interface Respuesta {
  tipo: "respuesta";
  esquema: number;
  id: string;
  rondaId: string;
  proveedorId: string;
  /** El texto tal como se leyó. Nunca se normaliza ni se recorta acá. */
  textoOriginal: string;
  leidaEn: string;
  error: string | null;
  procedencia: Procedencia;
  /**
   * Último mensaje del usuario en el panel, leído EN LA MISMA captura que
   * `textoOriginal`. `null` si el proveedor no tiene `userMessage.selector`
   * en su spec (todavía no derivado para los nueve) o no se pudo leer.
   */
  promptUsuarioLeido: string | null;
  /**
   * Cobertura del riesgo de "sin historial" (decisión de Juan,
   * 2026-08-26/09-01): sin rondas encadenadas, un panel intervenido a mano
   * puede tener la respuesta a OTRO prompt, y nada fallaría en rojo. Se
   * compara `promptUsuarioLeido` contra el resto del pool EN ESTA MISMA
   * captura. `true` = coincide con todos los demás no-nulos; `false` = no
   * coincide con al menos uno; `null` = no hay con qué comparar (menos de
   * dos proveedores con `promptUsuarioLeido` no nulo en la captura).
   * INFORMATIVO: nunca bloquea la captura, sólo se guarda como hecho.
   */
  promptCoincideEnPool: boolean | null;
  /**
   * `<a href="http...">` REALES en el DOM del cuerpo, contados en la MISMA
   * captura que `textoOriginal`. Decide entre las dos causas de "no hay URL
   * en el texto": (a) el selector pierde una fuente que sí está en el DOM
   * como link, o (b) no hubo búsqueda web / no se citó nada. `null` si no
   * se pudo contar (lectura fallida antes de llegar al DOM).
   */
  fuentesHref: number | null;
  /**
   * HTML crudo (`outerHTML`) del nodo de la respuesta, SIN recortes de
   * `exclude` — el DATO CANÓNICO del DOM, la misma regla que ya rige para
   * `textoOriginal` respecto del texto. Un selector nuevo derivado después
   * (contar links, aislar un panel de fuentes) se puede re-aplicar sobre
   * esto sin volver a capturar. `null` si no se pudo leer.
   */
  html: string | null;
}

/**
 * Una cita: un `<a href>` real encontrado en `Respuesta.html`, derivado
 * OFFLINE del HTML crudo (T1, Fase 3). Append-only, como todo hecho: si la
 * regla de extracción cambia, se vuelve a derivar del `html` original, que
 * nunca se reemplaza (§2 de `docs/BLUEPRINT.md`).
 *
 * `dondeVive` distingue dos ubicaciones DENTRO del subárbol capturado:
 * `"cuerpo"` cuando el `<a>` está en el flujo normal del texto, y
 * `"panel-ancestro"` cuando está anidado bajo un contenedor que se reconoce
 * estructuralmente como una lista de fuentes/citas (clase, id o
 * `data-*` con "cita", "fuente", "source" o "referenc"). Esto NO cubre un
 * panel de fuentes que viva fuera del nodo capturado (ver `fuentesHref`,
 * que sí puede subir por ancestros no capturados en `html`): ese caso es
 * indistinguible de "no hay más citas" con el dato que hoy se guarda, y por
 * eso `citas.length` puede ser MENOR que `fuentesHref` — es el criterio de
 * éxito corregido de T1, no un defecto de esta extracción.
 */
export interface Cita {
  tipo: "cita";
  esquema: number;
  id: string;
  /** La `Respuesta` de la que salió: sin esto una cita no es trazable. */
  respuestaId: string;
  /** Absoluta, nunca vacía: lo que no cumple esto se descarta antes de crear la Cita. */
  url: string;
  /** Texto visible del `<a>`, con las etiquetas internas removidas y recortado. */
  textoVisible: string;
  dondeVive: "cuerpo" | "panel-ancestro";
}

/**
 * La correspondencia etiqueta-ciega → identidad real, para UNA ronda. T3
 * (Fase 3): `anonymizeReplies` (en `packages/analysis`) ya calculaba esto
 * como `seal` en memoria, pero nadie lo guardaba — sin este hecho persistido,
 * "el informe lo arma el código y desanonimiza con el sello" no tiene
 * mecanismo: la semilla sola no alcanza para reconstruirlo salvo que el
 * orden de entrada al barajado sea estable entre la ronda real y quien
 * intente reproducirla, acoplamiento que se rompe en silencio si algún día
 * cambia el orden en que las respuestas llegan a `anonymizeReplies`.
 *
 * Un `Sello` por etiqueta por ronda — misma granularidad que `Intento` y
 * `Respuesta`, no un array embebido: append-only, nunca se reescribe.
 *
 * `label` es la etiqueta BARAJADA de esa ronda ("Modelo A"...) — nunca
 * estable entre rondas, es justo lo que blindea la posición.
 *
 * `codigoEstable` ("P1".."P8") — CORREGIDO en la revisión de T3
 * (2026-09-14): la primera versión de este campo NO EXISTÍA, con el
 * argumento de que el código era "puramente derivable del orden fijo del
 * pool" y no hacía falta guardarlo. Ese argumento estaba mal: el pool YA
 * cambió tres veces en esta fase (deepseek salió del pool de operadores,
 * kimi estuvo a punto de salir), y un informe archivado que dice "P3
 * convergió con P5" queda MINTIENDO en silencio si el orden del pool usado
 * para reconstruir "P3" cambia después. `codigosEstables`
 * (`packages/analysis`) sigue siendo pura — GENERA el código a partir del
 * orden del pool EN EL MOMENTO en que se arma el cuerpo de la ronda — pero
 * lo que lo hace estable es que, una vez generado, viaja DENTRO de este
 * hecho y nunca se vuelve a calcular para esta ronda.
 */
export interface Sello {
  tipo: "sello";
  esquema: number;
  id: string;
  rondaId: string;
  label: string;
  codigoEstable: string;
  panelSourceId: string;
  replyId: string;
  attemptId: string;
}

/**
 * T6 (Fase 3) — la salida cruda de UN operador sobre el prompt de operación.
 * REGLA DEL DATO CANÓNICO (misma que rige `Respuesta.textoOriginal` y
 * `Respuesta.html`): se guarda el TEXTO CRUDO COMPLETO tal como lo devolvió
 * el operador, sin recortar ni normalizar. Los `HallazgoHecho` que salgan de
 * parsearlo son HECHOS DERIVADOS que referencian este `id` — si el parseo
 * cambia mañana, se vuelve a derivar de `salidaCruda`, que nunca se
 * reemplaza.
 *
 * `promptCompleto` guarda el PROMPT ENTERO enviado, no un nombre ni una
 * versión de plantilla: si el texto de `armarPromptOperacion` cambia en
 * marzo, una corrida de enero tiene que seguir siendo interpretable con el
 * prompt que REALMENTE se usó, no con el que esté vigente el día que alguien
 * la relea.
 */
export interface SalidaOperador {
  tipo: "salida-operador";
  esquema: number;
  id: string;
  rondaId: string;
  operadorId: string;
  promptCompleto: string;
  salidaCruda: string;
  recibidaEn: string;
}

/**
 * Un hallazgo (o una limitación) derivado de `SalidaOperador.salidaCruda`
 * por `parsearHallazgos` (`packages/analysis`). `eje` es `null` en las
 * líneas LIMITACION — no llevan eje (ver `parsear-hallazgos.ts`).
 * `etiquetaInvalida` viaja del parseo tal cual: una etiqueta que el operador
 * inventó no se descarta, se registra como hecho sobre ESE operador.
 */
export interface HallazgoHecho {
  tipo: "hallazgo";
  esquema: number;
  id: string;
  /** Referencia al dato canónico del que se derivó — nunca se copia el texto. */
  salidaOperadorId: string;
  categoria: string;
  eje: string | null;
  etiquetas: string[];
  descripcion: string;
  etiquetaInvalida: boolean;
}

/**
 * T7 (Fase 3) — el informe del INTEGRADOR (deepseek), producido a partir de
 * la tabla de `HallazgoHecho` de una ronda. Misma REGLA DEL DATO CANÓNICO
 * que `SalidaOperador`: se guarda el TEXTO CRUDO COMPLETO del informe tal
 * cual lo devolvió el integrador, más el `promptCompleto` que lo produjo —
 * nunca por nombre de plantilla, para que una corrida vieja siga siendo
 * interpretable si el prompt cambia después. Las referencias `[H##]` que
 * `parsearReferenciasIntegrador` (`packages/analysis`) extraiga son hechos
 * DERIVADOS que apuntan a este `id`, no se guardan acá.
 */
export interface InformeIntegrador {
  tipo: "informe-integrador";
  esquema: number;
  id: string;
  rondaId: string;
  operadorId: string;
  promptCompleto: string;
  informeCrudo: string;
  recibidaEn: string;
}

/**
 * T7 (Fase 3, corrección de la ronda de la primera corrida real) — QUÉ
 * HERRAMIENTAS tenía cada parte en cada etapa es una CONDICIÓN DEL TURNO,
 * ya decidida como algo que se registra (§ "transferibilidad: registro de
 * las condiciones de cada turno", `docs/LIMITACIONES.md`). Antes de este
 * hecho, esa condición no tenía dónde vivir salvo anotada a mano fuera del
 * registro — y un dato de investigación anotado a mano fuera del registro
 * no existe (regla del instrumento).
 *
 * Sin selector derivado para leer el estado del interruptor de búsqueda web
 * en ningún proveedor todavía (`docs/BLUEPRINT.md`, fila "conmutador de
 * búsqueda web": **no encontrado** en varios), este hecho hoy sólo puede
 * escribirse `fuente: "declarado"` — Juan lo dice, el código lo persiste.
 * `"observado"` queda declarado para el día en que un selector permita
 * leerlo del DOM sin que Juan tenga que decirlo: el CAMPO no cambia, sólo
 * quién lo llena.
 *
 * La ASIMETRÍA que el instrumento existe para registrar (T1: investigación
 * CON búsqueda web; T2: operación SIN búsqueda web, para no dejar que un
 * operador aporte contenido propio que ningún investigador vio) no queda
 * escrita en ningún lado sin este campo.
 */
export interface CondicionHerramientas {
  tipo: "condicion-herramientas";
  esquema: number;
  id: string;
  rondaId: string;
  proveedorId: string;
  etapa: EtapaRonda;
  busquedaWebActivada: boolean;
  fuente: "declarado" | "observado";
  registradoEn: string;
}

/**
 * T7 (Fase 3) — "Capturar" en la etapa equivocada nunca se adivina: se
 * registra como HECHO. Un error de captura no es un `Intento` (eso mide un
 * ENVÍO) ni una `Respuesta` con `error` (eso asume que se sabía qué se
 * estaba leyendo) — es su propia categoría: "se intentó leer el panel
 * esperando el tipo de captura equivocado para la etapa en la que está la
 * ronda". `etapaEsperada`/`tipoCapturaIntentado` viajan tal cual se
 * calcularon (`etapaDeRonda`/`tipoCapturaDeEtapa` abajo) para que el hecho
 * sea autoexplicativo sin tener que reconstruir el estado de la ronda al
 * releerlo despues.
 */
export interface ErrorCaptura {
  tipo: "error-captura";
  esquema: number;
  id: string;
  rondaId: string;
  etapaEsperada: EtapaRonda;
  tipoCapturaIntentado: TipoCaptura;
  detalle: string;
  ocurridoEn: string;
}

/**
 * Defecto 1 de la corrida real de Juan (2026-09-19): una ronda cuya Parte 1
 * se envió a mano nunca pasa por `escribirRonda` con la pregunta real —
 * `Ronda.prompt` queda con el marcador interno "(capturado sin ronda de
 * envío: ...)", que NO es una pregunta. `Ronda` es append-only y ya se
 * escribió: no se reescribe (§2 del BLUEPRINT). Este hecho APARTE deja que
 * Juan declare, después, cuál fue la pregunta real de una ronda ya
 * capturada — con procedencia `"declarado-por-usuario"`, nunca `"observado"`,
 * porque nadie la observó: Juan la escribe de memoria o de sus notas.
 * Si hay más de una para la misma ronda (Juan la corrige dos veces), vale
 * la ÚLTIMA — mismo criterio que "el hecho más reciente gana" que ya usa el
 * resto del registro para estado derivado.
 */
export interface PreguntaDeclarada {
  tipo: "pregunta-declarada";
  esquema: number;
  id: string;
  rondaId: string;
  texto: string;
  declaradaEn: string;
  procedencia: "declarado-por-usuario";
}

/**
 * Selección de proveedores al iniciar (2026-09-23, pedido de Juan): qué
 * paneles estaban CARGADOS cuando se abrió la ronda. Es una condición de la
 * ronda, no una preferencia: la preferencia vive en un archivo aparte fuera
 * del registro; acá sólo queda lo que efectivamente estuvo cargado, para que
 * el informe pueda decir si la ronda corrió con menos que el pool completo.
 */
export interface CondicionProveedoresCargados {
  tipo: "condicion-proveedores-cargados";
  esquema: number;
  id: string;
  rondaId: string;
  proveedores: string[];
  /** Integrador elegido al abrir la ronda (2026-09-24). Ausente en rondas anteriores. */
  integrador?: string;
  registradoEn: string;
}

/** El integrador registrado al abrir la ronda, o `null` si la ronda es anterior a ese dato. */
export function integradorDeRonda(hechos: readonly Hecho[], rondaId: string): string | null {
  const c = hechos.filter(
    (h): h is CondicionProveedoresCargados => h.tipo === "condicion-proveedores-cargados" && h.rondaId === rondaId,
  );
  return c[c.length - 1]?.integrador ?? null;
}

/** La condición más reciente de la ronda, o `null` si la ronda es anterior a este hecho. */
export function proveedoresCargadosDeRonda(hechos: readonly Hecho[], rondaId: string): string[] | null {
  const c = hechos.filter(
    (h): h is CondicionProveedoresCargados => h.tipo === "condicion-proveedores-cargados" && h.rondaId === rondaId,
  );
  return c.length === 0 ? null : c[c.length - 1]!.proveedores;
}

export type Hecho =
  | Conversacion
  | Ronda
  | Intento
  | Respuesta
  | Cita
  | Sello
  | SalidaOperador
  | HallazgoHecho
  | InformeIntegrador
  | CondicionHerramientas
  | ErrorCaptura
  | PreguntaDeclarada
  | CondicionProveedoresCargados;

/**
 * EN QUÉ ETAPA está una ronda — T7, Fase 3. Deriva de HECHOS ya persistidos,
 * nunca de lo que haya en pantalla (§1 de la ronda de cableado): "Capturar"
 * necesita saber si tiene que escribir una `Respuesta`, una `SalidaOperador`
 * o un `InformeIntegrador`, y adivinarlo del CONTENIDO leído es exactamente
 * el error que este mecanismo evita.
 *
 *  · `"investigacion"` — todavía no corrió "Consolidar" para esta ronda (no
 *    hay `Sello`): los paneles tienen respuestas de los INVESTIGADORES.
 *  · `"operacion"` — "Consolidar" ya corrió (hay `Sello`) pero todavía no
 *    se capturaron las 8 `SalidaOperador`: los paneles tienen las
 *    respuestas de los OPERADORES al prompt de operación.
 *  · `"integracion"` — ya se capturaron las `totalOperadores` salidas de
 *    operador: el panel que queda por capturar es el del INTEGRADOR.
 *
 * `totalOperadores` se recibe como parámetro, nunca se importa desde
 * `apps/desktop` (`POOL_OPERADORES`): el dominio no depende de la app (§4).
 */
export type EtapaRonda = "investigacion" | "operacion" | "integracion";

export type TipoCaptura = "respuesta" | "salida-operador" | "informe-integrador";

/**
 * Defecto 1 — "hay algo en el campo" no alcanza como validación: el
 * marcador interno `PROMPT_SIN_RONDA` ("(capturado sin ronda de envío:
 * ...)") es texto no vacío y pasaba como si fuera una pregunta válida. Una
 * pregunta real de Juan, en español natural, no empieza con "(" ni contiene
 * ese marcador — cualquiera de las dos cosas es indicio seguro de que es un
 * texto del SISTEMA, no del investigador.
 */
export function esPreguntaValida(texto: string): boolean {
  const t = texto.trim();
  if (t.length === 0) return false;
  if (t.startsWith("(")) return false;
  if (t.toLowerCase().includes("capturado sin ronda de envio")) return false;
  return true;
}

/**
 * La pregunta EFECTIVA de una ronda: `Ronda.prompt` si es válida (caso
 * normal); si no, la `PreguntaDeclarada` más reciente para esa ronda, si
 * Juan ya declaró una y ES válida (nunca se acepta un marcador ahí tampoco);
 * si ninguna de las dos alcanza, `null` — quien llama decide cómo fallar.
 */
export function preguntaEfectivaDeRonda(hechos: readonly Hecho[], ronda: Ronda): string | null {
  if (esPreguntaValida(ronda.prompt)) return ronda.prompt;
  const declaradas = hechos.filter(
    (h): h is PreguntaDeclarada => h.tipo === "pregunta-declarada" && h.rondaId === ronda.id,
  );
  if (declaradas.length === 0) return null;
  const ultima = declaradas.reduce((a, b) => (b.declaradaEn > a.declaradaEn ? b : a));
  return esPreguntaValida(ultima.texto) ? ultima.texto : null;
}

export function etapaDeRonda(hechos: readonly Hecho[], rondaId: string, totalOperadores: number): EtapaRonda {
  const salidasDeLaRonda = hechos.filter((h) => h.tipo === "salida-operador" && h.rondaId === rondaId).length;
  if (salidasDeLaRonda >= totalOperadores) return "integracion";
  const huboConsolidacion = hechos.some((h) => h.tipo === "sello" && h.rondaId === rondaId);
  if (huboConsolidacion) return "operacion";
  return "investigacion";
}

export function tipoCapturaDeEtapa(etapa: EtapaRonda): TipoCaptura {
  switch (etapa) {
    case "investigacion":
      return "respuesta";
    case "operacion":
      return "salida-operador";
    case "integracion":
      return "informe-integrador";
  }
}

/** Serializa un hecho a su línea. Sin saltos adentro: una línea es un hecho. */
export function aLinea(hecho: Hecho): string {
  return JSON.stringify(hecho);
}

/**
 * Resultado de leer un registro. `hechos` son las líneas que se entendieron;
 * `lineasIlegibles` son las que no.
 *
 * Las ilegibles se CUENTAN y se DEVUELVEN, nunca se saltean en silencio. Un
 * archivo append-only puede quedar con la última línea a medio escribir si el
 * proceso se cortó, y eso hay que poder verlo — es la misma disciplina que
 * distingue "no pasó" de "no pude ver".
 */
export interface RegistroLeido {
  hechos: Hecho[];
  lineasIlegibles: { numero: number; contenido: string }[];
  /** `true` si la ÚNICA ilegible es la última: la firma de un corte a mitad de escritura. */
  ultimaLineaIncompleta: boolean;
}

const TIPOS = new Set([
  "conversacion",
  "ronda",
  "intento",
  "respuesta",
  "cita",
  "sello",
  "salida-operador",
  "hallazgo",
  "informe-integrador",
  "condicion-herramientas",
  "error-captura",
  "pregunta-declarada",
  "condicion-proveedores-cargados",
]);

export function leerRegistro(contenido: string): RegistroLeido {
  const lineas = contenido.split("\n");
  const hechos: Hecho[] = [];
  const ilegibles: { numero: number; contenido: string }[] = [];
  let ultimoIndiceNoVacio = -1;

  lineas.forEach((linea, i) => {
    if (linea.trim().length === 0) return;
    ultimoIndiceNoVacio = i;
    try {
      const v: unknown = JSON.parse(linea);
      if (typeof v !== "object" || v === null || !TIPOS.has(String((v as { tipo?: unknown }).tipo))) {
        ilegibles.push({ numero: i + 1, contenido: linea.slice(0, 200) });
        return;
      }
      hechos.push(v as Hecho);
    } catch {
      ilegibles.push({ numero: i + 1, contenido: linea.slice(0, 200) });
    }
  });

  return {
    hechos,
    lineasIlegibles: ilegibles,
    ultimaLineaIncompleta:
      ilegibles.length === 1 && ilegibles[0]!.numero === ultimoIndiceNoVacio + 1,
  };
}

/**
 * Deriva la procedencia de una lectura. Función PURA y sin dependencias, para
 * que la misma derivación valga en el camino real y en el arnés: una segunda
 * copia de esta lógica se desincronizaría (§7.2).
 *
 * `finDe` sale de `completionKind`: si el proveedor no dijo cómo terminó, el
 * fin es INFERIDO. El valor por defecto es el conservador a propósito.
 */
export function derivarProcedencia(lectura: {
  modelLabel?: string | null;
  completionKind?: "element-gone" | "quiescence";
  quiescenceMs?: number;
  generating: boolean | null;
}, contexto: {
  ahora: string;
  continuidad: Procedencia["continuidad"];
  metodoEscritura: Procedencia["metodoEscritura"];
  panel: string | null;
}): Procedencia {
  const label = lectura.modelLabel ?? null;
  return {
    modelLabel: label,
    modelLabelLeidaEn: label === null ? null : contexto.ahora,
    finDe: lectura.completionKind === "element-gone" ? "observado" : "inferido",
    quiescenceMs: lectura.quiescenceMs ?? null,
    generandoAlLeer: lectura.generating,
    continuidad: contexto.continuidad,
    metodoEscritura: contexto.metodoEscritura,
    panel: contexto.panel,
  };
}

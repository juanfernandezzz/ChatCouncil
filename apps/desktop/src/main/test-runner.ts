/**
 * test-runner.ts — verificación AUTÓNOMA de la Fase 1
 * ----------------------------------------------------
 * Corre la secuencia completa sin que nadie toque la interfaz, imprime un
 * informe en JSON por stdout y cierra la app. Se activa con `--cc-test`.
 *
 * POR QUÉ EXISTE. Las herramientas de navegador del agente hablan con
 * Chrome, no con una app de Electron: no hay forma de que "haga clic" en
 * esta ventana. En vez de delegar la prueba en una persona, la app se vuelve
 * SCRIPTABLE — que además es lo correcto a futuro, porque una verificación
 * que depende de que alguien mire la pantalla no se puede repetir en cada
 * entrega.
 *
 * LO ÚNICO QUE SIGUE SIENDO HUMANO: el login inicial en cada proveedor. No
 * por una limitación técnica sino por una regla: el agente nunca maneja
 * credenciales. Como las particiones son `persist:`, ese login se hace UNA
 * vez y todas las corridas siguientes lo reutilizan.
 *
 * EL DEFECTO QUE ESTE ARCHIVO EVITA, y conviene entender por qué. La lectura
 * devuelve SIEMPRE el último mensaje del asistente que haya en la página. Si
 * el envío del turno 2 falla en silencio, esa lectura sigue trayendo la
 * respuesta del turno 1 — y una comprobación de continuidad que sólo busque
 * la palabra del turno 1 en el texto del turno 2 se confirma A SÍ MISMA. Por
 * eso la continuidad exige TRES cosas: que el envío haya dado ok, que el
 * texto haya CAMBIADO respecto del turno anterior, y recién ahí que el
 * contenido demuestre memoria. Sin las dos primeras el resultado es
 * "indeterminada", no "confirmada" (BLUEPRINT §2: nunca se simula un
 * resultado; §7.9: un dato de procedencia desconocida no se usa).
 */

import { derivarProcedencia } from "@chatcouncil/domain";

export interface LecturaProveedor {
  id: string;
  text: string;
  /** `true` generando, `false` terminado, **`null` no observable**. */
  generating: boolean | null;
  /** `element-gone` = el fin se OBSERVA. `quiescence` = el fin se INFIERE. */
  completionKind?: "element-gone" | "quiescence";
  /** Cuánto tiene que quedarse quieto el texto para darlo por terminado. */
  quiescenceMs?: number;
  modelLabel?: string | null;
  /**
   * Subárbol del nodo de la etiqueta, tal como estaba EN ESTA lectura. No es
   * dato de investigación: es el instrumento que tiene que decidir por qué el
   * camino real guarda `GeminiFlash-Lite` donde el sondeo lee
   * `Gemini 3.5 Flash-Lite`. Va a un archivo de diagnóstico aparte, nunca al
   * registro append-only.
   */
  modelLabelDesglose?: unknown;
  error?: string;
}

export interface ResultadoEnvio {
  id: string;
  ok?: boolean;
  error?: string;
  modelLabel?: string | null;
  /** Idem, tomado justo después del envío — el momento en que el fallo ocurre. */
  modelLabelDesglose?: unknown;
}

export type EstadoContinuidad = "confirmada" | "refutada" | "indeterminada";

export interface InformeTest {
  sesiones: { id: string; cookies: number }[];
  turnos: {
    prompt: string;
    envio: ResultadoEnvio[];
    lectura: {
      id: string;
      chars: number;
      generating: boolean | null;
      /** "observado" si un indicador lo dijo; "inferido" si sólo se dedujo de la quietud. */
      finDe: "observado" | "inferido";
      muestra: string;
      error?: string;
    }[];
  }[];
  continuidad: { id: string; estado: EstadoContinuidad; motivo: string }[];
  veredicto: string[];
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const PASO_MS = 1500;

/** Ventana de quietud por defecto cuando la spec no declara ninguna. */
const QUIETUD_POR_DEFECTO_MS = 4_500;

/**
 * Espera a que TODOS terminen, **con la ventana de quietud de cada uno**.
 *
 * La versión anterior usaba un único criterio fijo —tres lecturas iguales cada
 * 1,5 s, o sea 4,5 s— para todos. Con un proveedor sin indicador observable
 * eso convierte cualquier pausa de más de 4,5 s en un fin de respuesta falso:
 * medido, una respuesta que pausaba 7 s en el medio se leía truncada a la
 * primera mitad. Y una pausa así no es un caso raro: es lo que hace un modelo
 * cuando piensa, usa una herramienta o arranca un bloque de código largo.
 *
 * Ahora cada proveedor lleva su propio reloj:
 *  · Si `generating` es `true`, no está quieto por definición.
 *  · Si es `false` —fin OBSERVADO—, alcanza con que el texto no crezca.
 *  · Si es `null` —fin INFERIDO—, el texto tiene que quedarse quieto durante
 *    el `quiescenceMs` COMPLETO que declara su spec.
 * Se devuelve cuando todos están quietos, o al vencer el techo global.
 *
 * **CERO CARACTERES NUNCA CUENTA COMO QUIETO.** Medido el 2026-08-23: qwen
 * quedó en 0 caracteres toda la espera y el ciclo lo dio por TERMINADO
 * —quieto en 0 durante `quiescenceMs`—, y ese resultado se guardó como una
 * respuesta válida. Quietud en 0 no es "terminó": es "nunca empezó". Un
 * proveedor que se queda en 0 sigue esperando hasta el TECHO GLOBAL
 * (`techoMs`), nunca antes — es la única forma de que el llamador pueda
 * distinguir "no generó nada en toda la ventana" (ausencia real) de "hay
 * contenido y dejó de crecer" (fin real). Es la misma familia de defecto
 * que costó la Fase 1: un valor que colapsa dos estados distintos.
 */
export async function esperarQuietud(
  leer: () => Promise<LecturaProveedor[]>,
  techoMs: number,
): Promise<LecturaProveedor[]> {
  const hasta = Date.now() + techoMs;
  /** id → { largo visto, momento en que dejó de crecer }. */
  const reloj = new Map<string, { largo: number; desde: number }>();
  let ultima: LecturaProveedor[] = [];

  for (;;) {
    ultima = await leer();
    const ahora = Date.now();

    const quietos = ultima.map((l) => {
      const previo = reloj.get(l.id);
      if (!previo || previo.largo !== l.text.length) {
        reloj.set(l.id, { largo: l.text.length, desde: ahora });
        return false;
      }
      // Ver comentario arriba: 0 caracteres nunca es "quieto". Sigue en el
      // bucle hasta el techo global, no hasta la ventana de quiescencia.
      if (l.text.length === 0) return false;
      if (l.generating === true) return false;
      // Fin observado: el indicador ya dijo que terminó y el texto no crece.
      if (l.generating === false) return true;
      // Fin inferido: hay que aguantar la ventana entera antes de creerle.
      const ventana = l.quiescenceMs ?? QUIETUD_POR_DEFECTO_MS;
      return ahora - previo.desde >= ventana;
    });

    if (quietos.every(Boolean)) return ultima;
    if (ahora > hasta) return ultima;
    await sleep(PASO_MS);
  }
}

const PALABRA_CLAVE = "LISTO";

/**
 * MODELO EXIGIDO **EN PRUEBAS**, y sólo en pruebas.
 *
 * Aclarado por Juan: la regla "con Claude, sólo Haiku" es una restricción del
 * ARNÉS DE VERIFICACION, no del producto. En uso normal Juan elige el modelo
 * que quiera en el panel nativo, que es justamente el motivo de mostrar la
 * interfaz del proveedor en vez de espejarla. Por eso este mapa vive acá
 * dentro y no en la spec del proveedor ni en el camino de `difundir`.
 *
 * Se comprueba ANTES de mandar el primer prompt: una corrida de prueba contra
 * un modelo caro es token pagado y tirado, y ya pasó una vez.
 *
 * Hoy `claude` no está en INVESTIGADORES, así que la comprobación queda
 * inerte y se activa sola el dia que se agregue.
 */
const MODELO_EXIGIDO_EN_PRUEBAS: Record<string, RegExp> = {
  claude: /haiku/i,
};

/**
 * Devuelve los motivos por los que NO se debe mandar nada. Vacío = adelante.
 * Si el modelo no se puede LEER, tampoco se manda: no verificar y suponer que
 * está bien es exactamente la forma en que se gastaron tokens de mas.
 */
function frenosDeModelo(lecturas: LecturaProveedor[]): string[] {
  const frenos: string[] = [];
  for (const l of lecturas) {
    const exigido = MODELO_EXIGIDO_EN_PRUEBAS[l.id];
    if (!exigido) continue;
    const etiqueta = l.modelLabel ?? "";
    if (etiqueta === "") {
      frenos.push(
        `${l.id}: no se pudo leer la etiqueta de modelo, asi que no se envia nada. ` +
          `Revisar el selector modelLabel de su spec.`,
      );
      continue;
    }
    if (!exigido.test(etiqueta)) {
      frenos.push(
        `${l.id}: el panel dice "${etiqueta}" y las pruebas exigen ${String(exigido)}. ` +
          `Cambiar el modelo en el panel antes de repetir. (Regla de pruebas, no del producto.)`,
      );
    }
  }
  return frenos;
}

export async function correrPruebaFase1(deps: {
  sesiones: () => Promise<{ id: string; cookies: number }[]>;
  difundir: (prompt: string) => Promise<ResultadoEnvio[]>;
  leer: () => Promise<LecturaProveedor[]>;
  /**
   * Escribe la respuesta ya QUIETA de cada proveedor en el almacén, una vez
   * por ronda. Deliberadamente separada de `leer`: `esperarQuietud` llama a
   * `leer` decenas de veces por ronda mientras espera, y escribir en cada una
   * de esas llamadas produciría docenas de respuestas por ronda en vez de
   * una — el contrato de la Fase 2 pide una respuesta por proveedor y ronda,
   * la ÚLTIMA lectura, no cada lectura intermedia de la espera.
   */
  registrarRespuestas: (lecturas: LecturaProveedor[]) => void;
}): Promise<InformeTest> {
  const informe: InformeTest = { sesiones: [], turnos: [], continuidad: [], veredicto: [] };

  // Dar tiempo a que las páginas de los proveedores terminen de cargar.
  await sleep(8000);

  informe.sesiones = await deps.sesiones();
  const sinSesion = informe.sesiones.filter((s) => s.cookies === 0).map((s) => s.id);
  if (sinSesion.length > 0) {
    informe.veredicto.push(
      `SIN SESION en: ${sinSesion.join(", ")}. Hay que loguearse UNA vez en esos paneles; ` +
        `es lo unico humano de esta prueba, porque el agente no maneja credenciales.`,
    );
  }

  // GATE DE MODELO, antes de mandar nada. Es lo unico que corre antes del
  // primer prompt, y a proposito: frenar despues de enviar no devuelve el
  // token gastado.
  //
  // La etiqueta de modelo de algunos proveedores (Claude) carga async DESPUES
  // del resto de la pagina, asi que una sola lectura a los 8s puede encontrar
  // el selector vacio sin que el selector este mal. Se reintenta unos
  // segundos antes de abortar en firme.
  let frenos = frenosDeModelo(await deps.leer());
  for (let intento = 0; intento < 4 && frenos.length > 0; intento++) {
    await sleep(3000);
    frenos = frenosDeModelo(await deps.leer());
  }
  if (frenos.length > 0) {
    informe.veredicto.push("ABORTADO por el gate de modelo de pruebas — no se envio ningun prompt:");
    for (const f of frenos) informe.veredicto.push(`  · ${f}`);
    return informe;
  }

  // Dos turnos: el segundo verifica que la conversación CONTINÚA en vez de
  // arrancar una nueva — que es lo que la persistencia de la vista promete.
  const prompts = [
    `Respondé sólo con la palabra ${PALABRA_CLAVE}.`,
    `¿Cuál fue exactamente mi mensaje anterior? Respondé sólo con ese texto.`,
  ];

  const envios: ResultadoEnvio[][] = [];
  const lecturasPorTurno: LecturaProveedor[][] = [];

  for (const prompt of prompts) {
    const envio = await deps.difundir(prompt);
    const lecturas = await esperarQuietud(deps.leer, 180_000);
    deps.registrarRespuestas(lecturas);
    envios.push(envio);
    lecturasPorTurno.push(lecturas);
    informe.turnos.push({
      prompt,
      envio,
      lectura: lecturas.map((l) => ({
        id: l.id,
        chars: l.text.length,
        generating: l.generating,
        // Misma derivación que el almacén real (`derivarProcedencia` del
        // dominio): una segunda copia de esta lógica se desincroniza (§7.2).
        finDe: derivarProcedencia(
          {
            modelLabel: l.modelLabel ?? null,
            generating: l.generating,
            ...(l.completionKind !== undefined ? { completionKind: l.completionKind } : {}),
            ...(l.quiescenceMs !== undefined ? { quiescenceMs: l.quiescenceMs } : {}),
          },
          { ahora: new Date().toISOString(), continuidad: "indeterminada", metodoEscritura: null, panel: null },
        ).finDe,
        // Muestra corta: alcanza para juzgar continuidad sin volcar la
        // respuesta entera a un log.
        muestra: l.text.slice(0, 120),
        ...(l.error ? { error: l.error } : {}),
      })),
    });
  }

  // --- Veredicto sobre lo MEDIDO, sin adornos --------------------------------
  const t1 = informe.turnos[0];
  if (t1) {
    const ok = t1.envio.filter((e) => e.ok).length;
    informe.veredicto.push(`Turno 1: ${ok} de ${t1.envio.length} recibieron el prompt.`);
    const conTexto = t1.lectura.filter((l) => l.chars > 0).length;
    informe.veredicto.push(`Turno 1: ${conTexto} de ${t1.lectura.length} produjeron texto legible.`);

    // Procedencia del fin de respuesta. No es un detalle: en los que dicen
    // "inferido" el fin no se observo, se dedujo de que el texto dejo de
    // crecer. Si la pausa real supera la ventana declarada, la lectura sale
    // truncada y NADA en el informe lo delata salvo esta linea.
    const inferidos = t1.lectura.filter((l) => l.finDe === "inferido").map((l) => l.id);
    if (inferidos.length > 0) {
      informe.veredicto.push(
        `Fin de respuesta INFERIDO (no observado) en: ${inferidos.join(", ")}. ` +
          `Esos proveedores no tienen indicador conocido: el fin sale de la ventana de ` +
          `quietud de su spec. Un prompt corto no ejercita esto — hace falta uno largo, ` +
          `con pausa real en el medio, para que la ventana quede medida.`,
      );
    }
  }

  const lec1 = lecturasPorTurno[0];
  const lec2 = lecturasPorTurno[1];
  const env2 = envios[1];
  if (lec1 && lec2 && env2) {
    const textoPrevio = new Map(lec1.map((l) => [l.id, l.text]));
    const envioDeTurno2 = new Map(env2.map((e) => [e.id, e]));
    for (const l of lec2) {
      const e = envioDeTurno2.get(l.id);
      if (!e || e.ok !== true) {
        informe.continuidad.push({
          id: l.id,
          estado: "indeterminada",
          motivo: `el envio del turno 2 no dio ok (${e?.error ?? "sin resultado"}): la lectura seria la del turno 1`,
        });
        continue;
      }
      if (l.text === (textoPrevio.get(l.id) ?? "")) {
        informe.continuidad.push({
          id: l.id,
          estado: "indeterminada",
          motivo: "la lectura no cambio respecto del turno 1 — texto rancio, no respuesta nueva",
        });
        continue;
      }
      const recuerda = new RegExp(PALABRA_CLAVE, "i").test(l.text);
      informe.continuidad.push({
        id: l.id,
        estado: recuerda ? "confirmada" : "refutada",
        motivo: recuerda
          ? "respuesta nueva que cita el turno anterior"
          : "respuesta nueva pero sin rastro del turno anterior",
      });
    }
    const conf = informe.continuidad.filter((c) => c.estado === "confirmada").map((c) => c.id);
    const ind = informe.continuidad.filter((c) => c.estado === "indeterminada").map((c) => c.id);
    informe.veredicto.push(
      conf.length > 0
        ? `Continuidad de hilo confirmada en: ${conf.join(", ")}.`
        : `Continuidad de hilo NO confirmada en ningun proveedor.`,
    );
    if (ind.length > 0) {
      informe.veredicto.push(
        `Continuidad INDETERMINADA en: ${ind.join(", ")} — no es un fallo de continuidad, ` +
          `es que la prueba no llego a poder evaluarla. Ver el motivo en "continuidad".`,
      );
    }
  }

  return informe;
}

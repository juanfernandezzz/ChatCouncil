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

export interface LecturaProveedor {
  id: string;
  text: string;
  generating: boolean;
  modelLabel?: string | null;
  error?: string;
}

export interface ResultadoEnvio {
  id: string;
  ok?: boolean;
  error?: string;
  modelLabel?: string | null;
}

export type EstadoContinuidad = "confirmada" | "refutada" | "indeterminada";

export interface InformeTest {
  sesiones: { id: string; cookies: number }[];
  turnos: {
    prompt: string;
    envio: ResultadoEnvio[];
    lectura: { id: string; chars: number; generating: boolean; muestra: string; error?: string }[];
  }[];
  continuidad: { id: string; estado: EstadoContinuidad; motivo: string }[];
  veredicto: string[];
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Espera a que TODOS terminen de generar: ni un marcador estructural solo ni
 * un tiempo fijo. Se corta cuando nadie está generando y el largo del texto
 * dejó de crecer, o al vencer el techo. Devolver antes de tiempo daría
 * lecturas truncadas que parecerían respuestas cortas.
 */
async function esperarQuietud(
  leer: () => Promise<LecturaProveedor[]>,
  techoMs: number,
): Promise<LecturaProveedor[]> {
  const hasta = Date.now() + techoMs;
  let previo = "";
  let estables = 0;
  let ultima: LecturaProveedor[] = [];
  for (;;) {
    ultima = await leer();
    const huella = ultima.map((l) => `${l.id}:${l.text.length}:${l.generating ? 1 : 0}`).join("|");
    const alguienGenerando = ultima.some((l) => l.generating);
    if (!alguienGenerando && huella === previo) {
      estables += 1;
      if (estables >= 3) return ultima;
    } else {
      estables = 0;
    }
    previo = huella;
    if (Date.now() > hasta) return ultima;
    await sleep(1500);
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
    envios.push(envio);
    lecturasPorTurno.push(lecturas);
    informe.turnos.push({
      prompt,
      envio,
      lectura: lecturas.map((l) => ({
        id: l.id,
        chars: l.text.length,
        generating: l.generating,
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

#!/usr/bin/env node
/**
 * Gate de ARTEFACTO — BLUEPRINT §6 ("compilar no es embarcar") y la lección
 * §7.7 (un `defineUnlistedScript` hizo que Rollup se llevara un módulo
 * entero por tree-shaking, con el build en verde).
 *
 * Verifica que lo COMPILADO contenga los marcadores de cada capacidad. No
 * mira el fuente: el fuente ya lo mira el typecheck, y el fuente no es lo que
 * se ejecuta.
 *
 * REGLA PARA ELEGIR MARCADORES (§7.7, cinco formas comprobadas en que un gate
 * miente): sólo **literales de cadena ASCII** que el código vivo contenga tal
 * cual. Nunca nombres de identificadores —se renombran al minificar—, nunca
 * texto con acentos —se escapa a \\uXXXX—, y nunca símbolos exportados sin
 * uso —se eliminan.
 *
 * Cero dependencias a propósito.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BASE = "apps/desktop/out";

/** archivo → marcadores que TIENEN que estar en el compilado. */
const EXIGIDO = {
  "main/index.js": [
    "cc:investigadores",
    "cc:difundir",
    "cc:leer",
    "cc:sesiones",
    "persist:",
    "--cc-test",
    "--cc-probe",
    "--cc-login",
    "--cc-solo=",
    "--cc-probe-escribe",
    "estadoCompositor",
    "con-texto",
    "compositorLimpio",
    "--cc-ventana=",
    // Salida a archivo: el crudo se adjunta en vez de transcribirse.
    "--cc-salida=",
    "CC_TEST_JSON",
    "CC_PROBE_JSON",
    // Del test-runner y del probe: prueba que NO se los llevó el tree-shaking.
    "continuidad",
    "indeterminada",
    "shadowRootsAbiertos",
    "data-message-author-role",
    // Procedencia del fin de respuesta: que llegue COMPILADO, no solo escrito.
    "inferido",
    "observado",
    // Gate de modelo de pruebas: que exista en el compilado, no solo en el fuente.
    "gate de modelo de pruebas",
    // Disposicion en fila (decision de Juan, 2026-08-01) y el ancho de panel
    // con el que se tomo cada muestra: es variable de la prueba, no adorno.
    "fila-horizontal",
    "disposicion",
    // El tamano PEDIDO y el REAL, los dos. La pantalla recorta y el marco resta.
    "ventanaPedida",
    "ventanaReal",
    // Medicion de las tres formas de escritura (§7.22). Si esto no esta
    // compilado, el sondeo volvio a confirmarse a si mismo.
    "escrituraPorMetodo",
    "execCommand",
    "envioHabilitadosDespues",
    // Latencia, no instantanea: sin estos campos el sondeo vuelve a informar
    // "0 nodos" sin poder distinguir "todavia no aparecio" de "no existe".
    "envioApareceMs",
    "envioHabilitaMs",
    "msDesdeNavegacion",
    "escrituraOmitida",
    // Las dos vias de la etiqueta de modelo, separadas y ambas informadas.
    "etiquetaModeloPorAtributo",
    "etiquetaModeloPorTexto",
    "etiquetaModeloPorForma",
    "MARCADORES_VIEJOS",
    "rutaDatos",
    // La app tiene carpeta propia. Sin esto las sesiones y los datos de
    // investigacion viven en la carpeta generica de Electron, compartida.
    "ChatCouncil",
    "setName",
    // Un solo proceso por particion: dos corrompen la base de sesion.
    "requestSingleInstanceLock",
    "CC_INSTANCIA",
    // Volcado de sesion antes de cerrar: quit a secas corta la escritura.
    "flushStorageData",
    // El volcado engancha en before-quit: un solo punto de salida, para que el
    // cierre del modo login tambien vuelque.
    "before-quit",
    "CC_CIERRE",
    // Censo de sesion: cantidades, nunca valores. Distingue las cookies que
    // sobreviven al cierre de las que Chromium borra al salir.
    "CC_CENSO_JSON",
    "deSesion",
    "antes-de-cerrar",
    // Nunca seguir una navegacion a un endpoint de cierre de sesion: esa pagina
    // cierra la sesion de verdad, y el sondeo se estaba deslogueando solo.
    "will-redirect",
    "redireccionesBloqueadas",
    "logout",
    // Banco de pruebas de persistencia sin cuentas ni humano.
    "--cc-sesion=",
    "cc_persistencia",
    "cc_persistencia_ls",
    "CC_SESION_JSON",
    "sobrevivio",
    // El banco de pruebas NUNCA toca una particion real: cada corrida sobre las
    // reales es una apertura y un cierre mas sobre las cuentas de Juan.
    "PARTICIONES_DE_PRUEBA",
    "pruebas-a",
    "muestraLimpia",
    // El sondeo reconoce y limpia su propia basura de una corrida anterior.
    "CC-SONDEO-NO-ENVIAR",
    "restoLimpiado",
    // El almacen de la Fase 2: un archivo por conversacion, append-only, y el
    // modo que lo vuelca por stdout.
    "conversaciones",
    "--cc-historial=",
    "CC_HISTORIAL_JSON",
    "lineasIlegibles",
    "ultimaLineaIncompleta",
    "esPrueba",
    "derivarProcedencia",
    "did-navigate",
    // Sondeo a pedido sobre la ventana VIVA. Sin esto, el unico sondeo posible
    // es el de arranque, que solo ve la pagina recien cargada y sin
    // conversacion: la pantalla en la que varios fallos NO ocurren (7.24).
    "cc:sondear",
    "CC_SONDEO_VIVO_JSON",
    // "sondeo-vivo" y NO "sondeos": el proceso principal ya tiene una variable
    // llamada `sondeos`, y el build no minifica, asi que ese marcador pasaba
    // por el motivo equivocado. Medido al escribirlo: con el manejador
    // cc:sondear borrado, el gate seguia encontrando "sondeos". Es la sexta
    // forma de gate que miente (§7.35), agarrada antes de confiar en ella.
    "sondeo-vivo",
    "rondasEnviadas",
    // Desglose del subarbol de la etiqueta de modelo: en QUE nodo vive cada
    // pedazo. Un candidato que solo informa texto ya concatenado no puede
    // distinguir "el nodo del numero no esta" de "la concatenacion se lo comio".
    "etiquetaModeloDesglose",
    "textoCompleto",
    "hermanos",
    // El selector de la SPEC, consultado directo y desglosado exista o no entre
    // los candidatos. Sin esto, "ninguna via lo propuso" se lee como "no esta
    // en el DOM", y son dos diagnosticos con arreglos opuestos: re-derivar el
    // selector, o mirar por que el texto se degrada. Los tres marcadores viven
    // DENTRO de FUENTE_SONDEO, que es un literal de cadena: cumplen la regla de
    // §7.7 de ser subcadenas ASCII que el codigo vivo contiene tal cual.
    "SELECTOR_ETIQUETA",
    "etiquetaModeloSpec",
    "textoComoLoLee",
    // Diagnostico de la etiqueta escrito en un archivo APARTE del registro: el
    // registro es el dato de investigacion y un volcado de DOM no es un hecho
    // de la investigacion. Los dos son literales de cadena de verdad.
    "diagnostico",
    "etiqueta-modelo",
    // Candidatos de la Fase 3 y el modo que los abre SOLOS para el login. Con
    // los seis abiertos sobre 1366 px quedan ~225 px por panel, ancho hostil
    // para una pantalla de inicio de sesion; con dos, ~675 px.
    "--cc-solo-candidatos",
    "chat.qwen.ai",
    "kimi.com",
    // El volcado de cierre y el censo recorren TODAS las particiones conocidas,
    // no solo los investigadores: si no, el login de qwen y kimi no se escribe
    // nunca y se pierde al salir (§7.50).
    "PARTICIONES_CONOCIDAS",
    // Controles ALREDEDOR del compositor. La lista generica de envio tiene cupo
    // y en kimi se lleno con botones de la barra lateral, informando cero
    // controles de envio cuando lo que pasaba era que el cupo estaba lleno de
    // ruido. Ahi mismo vive ademas el conmutador de investigacion profunda.
    "controlesDelCompositor",
    // Escribir en un CANDIDATO, que por definicion no tiene spec todavia: sin
    // esto no se puede derivar el control de envio, porque solo existe con
    // texto en el compositor.
    "--cc-compositor=",
  ],
  // "contenteditable" NO sirve como marcador: en el preload existe sólo como
  // miembro de un tipo, y los tipos se borran. El gate lo rechazó en su
  // primera corrida, que es exactamente para lo que está.
  "preload/provider.cjs": [
    "__ccProvider",
    "beforeinput",
    "insertText",
    "aria-disabled",
    "cuadro/s de texto",
    "composerMs",
    // La union discriminada tiene que existir en el compilado: si `kind`
    // vuelve a ser decorativo, esto no esta.
    "element-gone",
    "completionKind",
    // El error de envio tiene que distinguir "nunca aparecio" de "deshabilitado".
    "NUNCA aparecio",
    "deshabilitado",
    // Desglose de la etiqueta EN EL MOMENTO de la lectura real. Es lo unico que
    // puede mirar el estado de despues del envio, al que el sondeo no llega
    // porque tiene prohibido enviar. "data-test-id" es un literal de cadena de
    // la lista blanca de atributos y entro al preload SOLO por esta capacidad:
    // si el desglose se cae, el marcador se cae con el (probado en rojo).
    "data-test-id",
  ],
  "preload/ui.cjs": ["cc:investigadores", "cc:difundir", "cc:leer", "cc:sesiones", "cc:sondear"],
  "renderer/index.html": ["no-preguntar", "confirmacion", "paneles", "sondear"],
};

/**
 * Marcadores que NO pueden aparecer, **cada uno con su motivo**. El motivo va
 * al lado del marcador a proposito: un gate que frena con la razon equivocada
 * manda a quien lo lea a buscar el problema donde no esta.
 */
const CREDENCIALES = "el codigo NUNCA lee cookies, tokens ni almacenamiento de sesion";
const SIN_ENVIO =
  "el sondeo NUNCA envia. Puede escribir un marcador y limpiarlo, pero un clic o una tecla en el compositor " +
  "consumiria cuota y dejaria un mensaje en la conversacion de Juan, que no se deshace. Hubo una excepcion de " +
  "clic, su motivo resulto falso (era timing, no ausencia) y se revirtio; este gate impide que vuelva";

/**
 * EXCEPCIÓN POR LÍNEA — corregida el 2026-08-09.
 *
 * La primera versión de esta excepción era por ARCHIVO: si el archivo contenía
 * el marcador en algún lado, `localStorage` quedaba permitido en TODO el
 * archivo. Y `main/index.js` es UN SOLO archivo empaquetado con todo el
 * proceso principal adentro, y el marcador está encima en la lista de
 * EXIGIDOS, o sea que tiene que estar siempre. Resultado: la prohibición
 * quedaba apagada por completo y para siempre, con forma de excepción angosta.
 * Su propio comentario afirmaba lo contrario.
 *
 * Ahora la excepción se evalúa LÍNEA POR LÍNEA: `localStorage` sólo pasa en
 * una línea que además contiene el marcador de la prueba. Una aparición
 * cualquiera en otra línea rompe el gate igual que antes.
 *
 * EXCEPCIÓN, angosta y explícita: el banco de
 * pruebas de persistencia (`--cc-sesion=`) necesita tocar `localStorage` DE
 * VERDAD para probar que sobrevive al cierre — es lo que la prueba mide, no
 * un accidente. La partición es sintética (`https://localhost/`-equivalente
 * en loopback), la clave es nuestra (`cc_persistencia_ls`) y nunca se lee un
 * proveedor real.
 *
 * `MARCADOR_EXCEPCION` es la contraseña de esa excepción: `localStorage`
 * sólo se permite en un archivo si ESE MISMO archivo también contiene el
 * marcador de la prueba. Sin el marcador, la prohibición general sigue en
 * pie sin agujeros — un `localStorage` que aparezca sin `cc_persistencia_ls`
 * al lado sigue rompiendo el gate igual que antes.
 */
const MARCADOR_EXCEPCION = "cc_persistencia_ls";

const PROHIBIDO = {
  "main/index.js": [
    ["document.cookie", CREDENCIALES],
    ["localStorage", CREDENCIALES, MARCADOR_EXCEPCION],
    ["sessionStorage", CREDENCIALES],
    ["aria-haspopup", SIN_ENVIO],
    [".click()", SIN_ENVIO],
    ["KeyboardEvent", SIN_ENVIO],
  ],
  "preload/provider.cjs": [
    ["document.cookie", CREDENCIALES],
    ["localStorage", CREDENCIALES],
    ["sessionStorage", CREDENCIALES],
  ],
};

const fallos = [];

for (const [rel, marcadores] of Object.entries(EXIGIDO)) {
  const p = join(ROOT, BASE, rel);
  if (!existsSync(p)) {
    fallos.push(`${BASE}/${rel} — no existe. Correr el build antes del gate.`);
    continue;
  }
  const src = readFileSync(p, "utf8");
  for (const m of marcadores) {
    if (!src.includes(m)) {
      fallos.push(`${BASE}/${rel} — falta el marcador "${m}" en el COMPILADO (build verde, capacidad ausente)`);
    }
  }
}

for (const [rel, marcadores] of Object.entries(PROHIBIDO)) {
  const p = join(ROOT, BASE, rel);
  if (!existsSync(p)) continue;
  const src = readFileSync(p, "utf8");
  for (const [m, motivo, excepcion] of marcadores) {
    if (!src.includes(m)) continue;
    // Por línea, no por archivo: la excepción cubre la línea que la declara y
    // ninguna otra.
    const culpables = src
      .split("\n")
      .filter((linea) => linea.includes(m) && !(excepcion && linea.includes(excepcion)));
    if (culpables.length === 0) continue;
    fallos.push(
      `${BASE}/${rel} — aparece "${m}" en ${culpables.length} linea(s) sin la excepcion: ${motivo}`,
    );
  }
}

if (fallos.length > 0) {
  console.error("[guard:artefacto] FALLO:");
  for (const f of fallos) console.error("  · " + f);
  process.exit(1);
}

const total = Object.values(EXIGIDO).reduce((n, a) => n + a.length, 0);
console.log(`[guard:artefacto] OK — ${total} marcadores presentes en el compilado; sin accesos a credenciales y sin envios desde el sondeo.`);

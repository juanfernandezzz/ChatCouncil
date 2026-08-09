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
    // Banco de pruebas de persistencia sin cuentas ni humano.
    "--cc-sesion=",
    "cc_persistencia",
    "cc_persistencia_ls",
    "CC_SESION_JSON",
    "sobrevivio",
    "muestraLimpia",
    // El sondeo reconoce y limpia su propia basura de una corrida anterior.
    "CC-SONDEO-NO-ENVIAR",
    "restoLimpiado",
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
  ],
  "preload/ui.cjs": ["cc:investigadores", "cc:difundir", "cc:leer", "cc:sesiones"],
  "renderer/index.html": ["no-preguntar", "confirmacion", "paneles"],
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

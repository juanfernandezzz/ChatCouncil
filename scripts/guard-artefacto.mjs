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
    // Rediseño de la barra (2026-09-19, decisión de Juan): "Pegar en todos"
    // y "Capturar" se renombraron a "Pegar pregunta en todos" y "Capturar
    // todos" (siete botones en total) — mismos canales IPC RENOMBRADOS, no
    // una capacidad nueva ni una vieja que desapareció. "cc:difundir" y
    // "cc:leer" salen de esta lista por el mismo motivo que ya sacó
    // "kimi.com" en su momento: el marcador viejo dejó de ser el nombre
    // correcto de la misma capacidad.
    "cc:pegar-pregunta-en-todos",
    "cc:pegar-pregunta-aqui",
    "cc:capturar-todos",
    "cc:capturar-uno",
    "cc:pegar-operacion-en-todos",
    "cc:pegar-operacion-aqui",
    // Menu Ventana: prompt pegado + cuerpo como .txt (2026-10-01).
    "cc:pegar-operacion-archivo",
    // Aviso de una vez por ronda antes de pegar la operación (2026-09-30).
    "cc:aviso-operacion-pendiente",
    "cc:pegar-integrador",
    // 7-1-1 (2026-09-29): el tercer rol. Sin este literal, un tree-shaking que se
    // lleve la regla de roles distintos deja guardar integrador = verificador.
    "El integrador y el verificador tienen que ser proveedores distintos.",
    // "Pegar verificación" y la captura del verificador (7-1-1).
    "cc:pegar-verificacion",
    "salida-verificador",
    // Comprobacion mecanica de URLs del verificador: el modo y el hecho.
    "--cc-comprobar-urls=",
    "url-comprobada",
    // Las dos secciones del verificador en el informe final (el resto del
    // encabezado lleva acentos y se escapa al compilar).
    "(aporte del verificador)",
    // Correspondencia con la fuente y tipo de fuente, separados (2026-10-04):
    // el prompt nuevo del verificador, las palabras clave que lee el parseo
    // (las nuevas y las del formato anterior, para las rondas ya capturadas),
    // el tipo en el informe final y la cita que usa el redactor.
    "CONFIRMA|OFICIAL,PRIMARIA|H12|",
    "NO_ENCONTRADA|NO_VERIFICADO|VERIFICADO|CONFIRMA|CONTRADICE|CONTRADICHO|PUNTO_CIEGO|PREGUNTA",
    "tipo no reconocido: ",
    "tipo de fuente no registrado (formato anterior)",
    "[CONFIRMA H12]",
    // Menu Ventana: recapturar el integrador sin mirar la etapa (2026-09-30).
    "Recapturar integrador",
    "cc:recapturar",
    // Redactor (2026-10-02): pegar, capturar y su hecho en el registro.
    "cc:pegar-redactor",
    "cc:capturar-redactor",
    "respuesta-redactor",
    // 2026-10-03: ronda nueva con respuestas copiadas de la anterior.
    "copiadaDe",
    "cc:sesiones",
    // Fase 5 — el informe final se entrega como CARPETA con las respuestas de
    // los investigadores en PDF adentro. Sin estos marcadores, un tree-shaking
    // que se lleve `entregarCarpetaDeInforme` deja el build en verde y "Armar
    // informe final" fallando en la mano de Juan.
    "Respuestas de los investigadores",
    "Carpeta del informe:",
    // Fidelidad del PDF (2026-10-04, MEDIDO). Los tres arreglan perdida de
    // contenido o de estructura al convertir el .md, y los tres son faciles de
    // borrar sin que nada falle:
    //  · "breaks: true" — sin el, Markdown junta en un parrafo las lineas que
    //    el informe usa sueltas: los siete operadores salian en un bloque
    //    corrido y la linea "Fuente: <URL>" se pegaba a su descripcion.
    //  · overflow-wrap / white-space — sin ellos, un trozo de texto sin punto
    //    de corte se DESBORDA y Chromium lo RECORTA: medido, 240 caracteres
    //    seguidos salian 116 en el PDF, y 167 dentro de un bloque de codigo
    //    salian 148.
    "breaks: true",
    "overflow-wrap: break-word",
    "white-space: pre-wrap",
    // "Armar informe final" tenia cuatro puntos que TIRAN y ninguno atajado:
    // `ipcMain.handle` convierte el throw en una promesa rechazada y el
    // renderer la consumia sin `.catch`, asi que la barra quedaba en "Armando
    // el informe final…" para siempre, sin decir nada. Sin este literal, el
    // try/catch se puede borrar y nada falla en rojo.
    "No se pudo armar el informe final:",
    // Las marcas de integridad del archivo son instrumentacion, no contenido,
    // y entran al informe por tres caminos distintos (cuerpo del redactor,
    // descripcion de un hallazgo, cita del verificador). Sin este literal, el
    // filtro se puede borrar y el informe vuelve a mostrarlas sin que nada
    // falle en rojo.
    "marca(s) de integridad",
    // El control de "salio a la red" del redactor compara los enlaces del html
    // contra las URLs que el material de la ronda ya traia. Sin la comparacion,
    // un enlace que el redactor copio del material se contaba como salida a la
    // red: el archivo que recibe LLEVA las URLs de las siete respuestas.
    "en el material de la ronda",
    // Cada respuesta de investigador se escribe en su propio try (el .md y el
    // PDF por separado). Sin esto, un fallo al escribir UN .md abortaba el
    // bucle: las siguientes respuestas no se escribian, la nota "FALTAN" no se
    // escribia, y el mensaje afirmaba una completitud que no habia.
    "no se pudo escribir el .md (",
    "no se pudo generar el PDF (",
    "respuestas completas;",
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
    // Cambio de cuenta (2026-09-27): cerrar sesion de un panel a pedido, sin
    // navegar a logout. Si esto no esta compilado, el menu queda sin la accion
    // y no hay forma de cambiar de cuenta, con el build en verde. ASCII a
    // proposito (la etiqueta con acentos se escapa a \\uXXXX).
    "sesion CERRADA a pedido en",
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
    // "kimi.com" dejó de ser el dominio correcto el 2026-08-21: pasó a servir
    // la versión china de Kimi. El producto internacional se mudó a
    // "kimi.ai", que es lo que el marcador exige ahora.
    "kimi.ai",
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
    // 2026-10-03: archivos de vista previa de kimi agregados a la respuesta.
    "=== ARCHIVO: ",
    // "beforeinput" SALIÓ de esta lista el 2026-09-13 (ronda de camino de
    // entrada portable, Objetivo 1 y 2). Ya no se construye ese evento a
    // mano: `writePrompt` escribe con `document.execCommand('insertText')`,
    // que dispara `beforeinput`/`input` NATIVOS como efecto del navegador,
    // no como código nuestro — la capacidad que el marcador protegía
    // (que el editor se entere de la escritura) sigue existiendo, MEDIDA
    // mejor que antes: es la misma vía confirmada registrando escritura en
    // los nueve proveedores y enviando de verdad en kimi y qwen. Mantener el
    // marcador viejo habría bloqueado en rojo un cambio ya autorizado y
    // medido, por el motivo equivocado — exactamente lo que este gate existe
    // para evitar en la dirección contraria.
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
  "preload/ui.cjs": [
    "cc:pegar-redactor",
    "cc:capturar-redactor",
    "cc:investigadores",
    "cc:pegar-pregunta-en-todos",
    "cc:pegar-pregunta-aqui",
    "cc:capturar-todos",
    "cc:capturar-uno",
    "cc:pegar-operacion-archivo",
    "cc:sesiones",
    "cc:sondear",
  ],
  // "sondear" salio de la barra principal (decision de Juan, 2026-09-01: un
  // solo boton, "Capturar", fusiona lo que hacian "Leer" y "Sondear"; el
  // sondeo de derivacion de specs sigue existiendo pero como modo de
  // diagnostico por bandera de linea de comando, no como paso del flujo).
  // 2026-09-30: "Pegar operación en este panel" en la barra, con su aviso.
  "renderer/index.html": ["no-preguntar", "confirmacion", "paneles", "capturar", "pegar-verificacion", "pegar-operacion-aqui", "aviso-operacion-pegar", "pegar-redactor"],
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

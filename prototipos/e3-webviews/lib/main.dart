// Prototipo desechable de E3: un exe por plugin de webview (construir.ps1 elige el plugin en lib/candidato.dart).
// Uso: e3_webviews.exe <windows|floating|plus|inapp> <diez|escribir|leer|pruebas|google> <carpeta-de-datos> [salida.json]
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';

import 'candidato.dart';
import 'panel.dart';

const urlsProveedores = [
  // packages/providers/src/specs.json (ChatCouncil-Unity 247f6db), newConversationUrl de cada proveedor.
  'https://chatgpt.com/', 'https://chat.z.ai/', 'https://claude.ai/new', 'https://gemini.google.com/app',
  'https://grok.com/', 'https://chat.mistral.ai/', 'https://chat.qwen.ai/', 'https://kimi.ai/',
  'https://chat.deepseek.com/sign_in', 'https://www.perplexity.ai/',
];
const puerto = 47831; // fijo: el origen local tiene que ser el mismo entre corridas para el perfil persistente
const textoPrueba = 'Ñandú café — áéíóú ÁÉÍÓÚ ü ¿¡ y emojis 😀👍🏽🇨🇱';

const paginaLocal = '''<!doctype html><meta charset="utf-8"><title>e3</title>
<body style="margin:0;padding:80px 8px 8px">
<textarea id="ta" rows="3" cols="40"></textarea>
<div id="ce" contenteditable="true" style="border:1px solid #888;min-height:40px"></div>
<div id="respuesta"><p>Hola <b>mundo</b> ñ 😀</p></div>
<input type="file" id="f">
<script>
// Como los compositores reales: un paste se inserta desde clipboardData.
for (const el of [document.getElementById('ta'), document.getElementById('ce')]) {
  el.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
}
</script>''';

Future<void> esperarCarga(Panel p) async {
  for (var i = 0; i < 120; i++) {
    try {
      // about:blank también llega a «complete» antes de que el plugin navegue a la URL inicial.
      if (await p.js("location.href === 'about:blank' ? 'vacia' : document.readyState") == 'complete') return;
    } catch (_) {}
    await Future.delayed(const Duration(milliseconds: 500));
  }
  throw TimeoutException('la página no terminó de cargar en 60 s');
}

Future<Object?> intentar(Future<Object?> Function() f) async {
  try {
    return await f();
  } catch (e) {
    return {'error': '$e'};
  }
}

Future<Map<String, Object?>> pruebas(Panel p, String datos) async {
  final compositor = await intentar(() => p.js('''(() => {
    const t = ${jsonEncode(textoPrueba)};
    const leer = el => el.tagName === 'TEXTAREA' ? el.value : el.textContent;
    const probar = (el, modo) => {
      el.focus();
      if (el.tagName === 'TEXTAREA') el.value = ''; else el.textContent = '';
      if (modo === 'insertText') document.execCommand('insertText', false, t);
      else { const dt = new DataTransfer(); dt.setData('text/plain', t);
             el.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true})); }
      const v = leer(el);
      return {igual: v === t, leidos: [...v].length, esperados: [...t].length};
    };
    const ta = document.getElementById('ta'), ce = document.getElementById('ce');
    return JSON.stringify({textareaInsertText: probar(ta, 'insertText'), textareaPaste: probar(ta, 'paste'),
                           contenteditableInsertText: probar(ce, 'insertText'), contenteditablePaste: probar(ce, 'paste')});
  })()'''));
  final dom = await intentar(() async {
    final r = await p.js(
        "JSON.stringify({texto: document.querySelector('#respuesta').innerText, html: document.querySelector('#respuesta').outerHTML})");
    return {...r as Map, 'textoIgual': r['texto'] == 'Hola mundo ñ 😀', 'htmlTraeNegrita': '${r['html']}'.contains('<b>mundo</b>')};
  });
  final adjunto = File('$datos${Platform.pathSeparator}e3-adjunto.txt')..writeAsStringSync('adjunto de prueba E3\n');
  final archivo = await intentar(() async {
    final doc = await p.cdp('DOM.getDocument', {}) as Map;
    final q = await p.cdp('DOM.querySelector', {'nodeId': doc['root']['nodeId'], 'selector': '#f'}) as Map;
    await p.cdp('DOM.setFileInputFiles', {'files': [adjunto.path], 'nodeId': q['nodeId']});
    final r = await p.js(
        "JSON.stringify({n: document.getElementById('f').files.length, nombre: document.getElementById('f').files[0]?.name, bytes: document.getElementById('f').files[0]?.size})");
    return {...r as Map, 'esperado': {'nombre': 'e3-adjunto.txt', 'bytes': adjunto.lengthSync()}};
  });
  return {'compositor': compositor, 'dom': dom, 'archivo': archivo};
}

const leerPerfil = "JSON.stringify({cookie: document.cookie, localStorage: localStorage.getItem('cc_e3')})";

Future<Object?> correrModo(String modo, Panel p, String datos) async {
  await esperarCarga(p);
  switch (modo) {
    case 'escribir':
      final r = await intentar(() => p.js(
          "document.cookie = 'cc_e3=persistente; max-age=86400; path=/'; localStorage.setItem('cc_e3', 'persistente'); $leerPerfil"));
      await Future.delayed(const Duration(seconds: 5)); // deja que WebView2 baje cookies y almacenamiento a disco
      return r;
    case 'leer':
      return intentar(() => p.js(leerPerfil));
    case 'pruebas':
      return pruebas(p, datos);
    case 'google':
      await Future.delayed(const Duration(seconds: 6));
      return intentar(() => p.js('''JSON.stringify({host: location.host, ruta: location.pathname, titulo: document.title,
        disallowedUseragent: document.documentElement.innerText.includes('disallowed_useragent'),
        avisoInseguro: /no (es|sea) seguro|may not be secure/i.test(document.documentElement.innerText),
        campoCorreo: !!document.querySelector('input[type=email]')})'''));
  }
  throw ArgumentError('modo desconocido: $modo');
}

final paneles = ValueNotifier<List<Panel>>([]);

Future<void> main(List<String> args) async {
  final plugin = args[0], modo = args[1], datos = args[2];
  // En «diez», el cuarto argumento es una URL para los diez paneles (medición controlada); en los demás modos, el archivo de salida.
  final urlDiez = modo == 'diez' && args.length > 3 ? args[3] : null;
  final salida = args.length > 3 && urlDiez == null ? File(args[3]) : null;
  void escribir(Object? r) =>
      salida?.writeAsStringSync(const JsonEncoder.withIndent('  ').convert({'plugin': plugin, 'modo': modo, 'resultado': r}));
  // El runner de Windows muestra la ventana con el primer cuadro: runApp va antes que los plugins.
  runApp(MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Scaffold(
      body: ValueListenableBuilder(
        valueListenable: paneles,
        builder: (_, ps, __) => ps.isEmpty
            ? const Center(child: Text('creando paneles'))
            : modo == 'diez'
                ? GridView.count(crossAxisCount: 5, childAspectRatio: 0.75, children: [for (final p in ps) p.widget])
                : Stack(children: [
                    Positioned.fill(child: ps.first.widget),
                    // Un widget de Flutter encima del webview: si se ve en la captura, el plugin permite dibujar encima.
                    Positioned(
                        left: 0, top: 0, width: 260, height: 60,
                        child: Container(color: Colors.red, alignment: Alignment.center,
                            child: const Text('FLUTTER ENCIMA', style: TextStyle(color: Colors.white, fontSize: 20)))),
                  ]),
      ),
    ),
  ));
  try {
    Directory(datos).createSync(recursive: true);
    if (modo != 'diez' && modo != 'google') {
      final servidor = await HttpServer.bind(InternetAddress.loopbackIPv4, puerto);
      servidor.listen((req) => req.response
        ..headers.contentType = ContentType.html
        ..write(paginaLocal)
        ..close());
    }
    final urls = switch (modo) {
      'diez' => urlDiez == null ? urlsProveedores : List.filled(10, urlDiez),
      'google' => ['https://accounts.google.com/'],
      _ => ['http://127.0.0.1:$puerto/'],
    };
    paneles.value = await crearPaneles(datos, urls);
    if (modo == 'diez') return;
    escribir(await correrModo(modo, paneles.value.first, datos));
  } catch (e, st) {
    escribir({'error': '$e', 'pila': '$st'});
    exit(1);
  }
  if (modo != 'pruebas') exit(0); // en «pruebas» queda abierta para la captura del widget encima
}

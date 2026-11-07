import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:webview_plus/webview_plus.dart' as wp;
// ignore: implementation_imports
import 'package:webview_plus/src/webview_plus_environment.dart' as wpe; // el paquete no exporta el entorno

import 'panel.dart';

class PanelPlus extends Panel {
  final listo = Completer<wp.WebviewPlusController>();
  @override
  late final Widget widget;
  PanelPlus(String url, wpe.WebViewEnvironment env) {
    // initialUrl llega al create nativo pero la vista queda en about:blank (E3): se navega explícito al crearse.
    widget = wp.WebviewWidget(
        webViewEnvironment: env,
        initialUrl: url,
        onWebViewCreated: (c) async {
          await c.loadUrl(url);
          listo.complete(c);
        });
  }
  @override
  Future<dynamic> js(String codigo) async => normalizar(await (await listo.future).evaluateJavascript(codigo));
}

Future<List<Panel>> crearPaneles(String datos, List<String> urls) async {
  final env = await wpe.WebViewEnvironment.create(settings: wpe.WebViewEnvironmentSettings(userDataFolder: datos));
  return [for (final u in urls) PanelPlus(u, env)];
}

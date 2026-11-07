import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart' as iaw;

import 'panel.dart';

class PanelInapp extends Panel {
  final listo = Completer<iaw.InAppWebViewController>();
  @override
  late final Widget widget;
  PanelInapp(String url, iaw.WebViewEnvironment env) {
    widget = iaw.InAppWebView(
        webViewEnvironment: env,
        initialUrlRequest: iaw.URLRequest(url: iaw.WebUri(url)),
        onWebViewCreated: listo.complete);
  }
  @override
  Future<dynamic> js(String codigo) async => normalizar(await (await listo.future).evaluateJavascript(source: codigo));
  @override
  Future<dynamic> cdp(String metodo, Map<String, dynamic> parametros) async =>
      normalizar(await (await listo.future).callDevToolsProtocolMethod(methodName: metodo, parameters: parametros));
}

Future<List<Panel>> crearPaneles(String datos, List<String> urls) async {
  final env = await iaw.WebViewEnvironment.create(settings: iaw.WebViewEnvironmentSettings(userDataFolder: datos));
  return [for (final u in urls) PanelInapp(u, env)];
}

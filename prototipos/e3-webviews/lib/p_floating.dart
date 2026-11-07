import 'package:flutter/widgets.dart';
import 'package:webview_win_floating/webview_win_floating.dart' as wf;

import 'panel.dart';

class PanelFloating extends Panel {
  final wf.WinWebViewController c;
  PanelFloating(String datos)
      : c = wf.WinWebViewController(params: wf.WindowsWebViewControllerCreationParams(userDataFolder: datos));
  @override
  Widget get widget => wf.WinWebViewWidget(controller: c);
  @override
  Future<dynamic> js(String codigo) async => normalizar(await c.runJavaScriptReturningResult(codigo));
}

Future<List<Panel>> crearPaneles(String datos, List<String> urls) async {
  final ps = <Panel>[];
  for (final u in urls) {
    final p = PanelFloating(datos);
    await p.c.loadRequest(Uri.parse(u));
    ps.add(p);
  }
  return ps;
}

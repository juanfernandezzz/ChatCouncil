import 'package:flutter/widgets.dart';
import 'package:webview_windows/webview_windows.dart' as ww;

import 'panel.dart';

class PanelWindows extends Panel {
  final c = ww.WebviewController();
  @override
  Widget get widget => ww.Webview(c);
  @override
  Future<dynamic> js(String codigo) async => normalizar(await c.executeScript(codigo));
}

Future<List<Panel>> crearPaneles(String datos, List<String> urls) async {
  await ww.WebviewController.initializeEnvironment(userDataPath: datos);
  final ps = <Panel>[];
  for (final u in urls) {
    final p = PanelWindows();
    await p.c.initialize();
    await p.c.loadUrl(u);
    ps.add(p);
  }
  return ps;
}

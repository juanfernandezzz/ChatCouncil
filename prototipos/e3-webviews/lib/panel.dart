import 'dart:convert';

import 'package:flutter/widgets.dart';

/// Normaliza lo que devuelve cada plugin: algunos dan el JSON ya decodificado y otros una cadena, a veces doble.
dynamic normalizar(dynamic r) {
  while (r is String) {
    try {
      r = jsonDecode(r);
    } catch (_) {
      break;
    }
  }
  return r;
}

abstract class Panel {
  Widget get widget;
  Future<dynamic> js(String codigo);
  Future<dynamic> cdp(String metodo, Map<String, dynamic> parametros) =>
      throw UnsupportedError('el plugin no expone DevTools Protocol');
}

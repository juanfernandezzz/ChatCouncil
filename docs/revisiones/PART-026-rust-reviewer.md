# Revisión PART-026 · agente rust-reviewer + ponytail-review

Revisión de los cambios sin commitear de la rama part-026 (solo lectura; el agente no corrió cargo).
Veredicto del agente: sin CRITICAL ni HIGH; 2 MEDIUM, 6 LOW.

| # | Sev. | Hallazgo | Qué se hizo |
|---|---|---|---|
| 1 | MEDIUM | Las marcas se guardan pero la captura en vivo no tiene control de lectura del operador: solo `medicion_e9` usa `lectura_de_operador`. | Fuera del alcance (4.3 pide guardar y leer desde el control del operador; el control en vivo no existe). Se corrigió el comentario para decirlo. Se reporta a Juan. |
| 2 | MEDIUM | Si `guardar_marcas` fallaba, la operación ya pegada no se registraba. | Corregido: las marcas se guardan después de registrar la operación y su fallo ya no marca la operación como fallida (reintentar pegaría dos veces); sin .marcas la lectura queda «sin-marcas-registradas». |
| 3 | LOW | `nombre_de_archivo_adjunto` aceptaba `:` y `..`. | Corregido y probado. |
| 4 | LOW | 6 hex = 24 bits; colisión posible en el mismo minuto. | Se deja: 7 paneles, probabilidad ~1/16,7 millones por par (lo pide el lote: 6 hex). |
| 5 | LOW | `medir_situacion_e9`: repetición 1 en frío, 2-5 en caliente. | Documentado en el test; se informa frío (16,2 ms/panel, una sola vez) y mediana caliente (0,12 y 0,94 ms). |
| 6 | LOW | Cambió el archivo por defecto de `CC_E9_REGISTRO` a `e9-registro-p26.jsonl`. | Revertido (fuera de alcance): el defecto vuelve a e9-registro.jsonl; la medición pasa CC_E9_REGISTRO. |
| 7 | LOW | El test no simulaba rechazos, CRLF ni vacío. | Añadidos esos casos. (Un reinicio real = otro proceso: la prueba guarda y lee solo por disco.) |
| 8 | LOW | Falta línea en blanco antes de `#[cfg(test)]`. | Corregido. |
Prueba de la conexión en la app: pruebaronda ahora exige el .marcas en disco por operación. En rojo (sin la llamada a guardar_marcas) dio 100/101 («conversación nueva de la app… 0 de 6»); en verde 101/101.

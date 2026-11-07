# Datos

Propósito: que la app nueva use los mismos datos que ChatCouncil-Unity, sin reescribirlos: los specs de los proveedores y los literales de los prompts.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo. Los sha256 son del archivo entero, con saltos LF, iguales al blob de HEAD.

## Requisitos

### DAT-001 · specs.json idéntico
- Qué hace: la app nueva carga packages/providers/src/specs.json con contenido idéntico al de ChatCouncil-Unity.
- Condición y resultado observable: el sha256 del specs.json que trae la app nueva es 23f6142a766d2052bcb7b5ce9bed7ed6b84e1687e9605181e500aa5a442829ba.
- Fuente: packages/providers/src/specs.json:1-406
- Prueba: nueva (comparación de hash) — calcular el sha256 del specs.json empaquetado en la app nueva y compararlo con el de arriba.
- Plataforma: ambas

### DAT-002 · Literales de los prompts idénticos
- Qué hace: los literales de prompt-operacion.ts, prompt-integrador.ts, prompt-verificador.ts y prompt-redactor.ts son idénticos en la app nueva.
- Condición y resultado observable: los sha256 de los cuatro archivos fuente son prompt-operacion.ts d633e7551b6d3ff0f0f04efd02e18225a82f907114bc70585faf22c0670b9302, prompt-integrador.ts 838ba7b42d0a317f6d2a8de00da9a02d665da8afb978c14ae5e81c4021708e23, prompt-verificador.ts 615d7b3c527af5d83cdc1cfaffbd6eff98f24ac9427a7a19c0e777fc117a6618 y prompt-redactor.ts c3963ba140cbf07e9419658130071b908bd3b4856aa51b238258a370ac7bb8fb; la app nueva toma sus literales de esos archivos sin cambios.
- Fuente: packages/analysis/src/prompt-operacion.ts:1-207 ; packages/analysis/src/prompt-integrador.ts:1-118 ; packages/analysis/src/prompt-verificador.ts:1-104 ; packages/analysis/src/prompt-redactor.ts:1-104
- Prueba: nueva (comparación de hash) — calcular el sha256 de los cuatro archivos de los que la app nueva extrae sus literales y compararlo con los de arriba.
- Plataforma: ambas

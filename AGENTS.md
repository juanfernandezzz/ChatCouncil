# AGENTS.md · ChatCouncil

ChatCouncil es un consejo de modelos de IA que investigan en las páginas web reales de cada proveedor, con las cuentas de Juan, y producen un informe trazable. Esquema 7-1-2-1: siete investigadores, un integrador, dos verificadores y un redactor. Este repo lo reconstruye en Rust, todo lo posible, con una interfaz Slint: un solo código para Windows, macOS, Linux, Android e iOS, de escritorio, móvil y tableta (ADR-0004). Glosario: CONTEXT.md.

La referencia de funciones es github.com/juanfernandezzz/ChatCouncil-Unity: todo lo que funciona ahí se mantiene, de la misma forma. Ninguna versión anterior es criterio de diseño de la interfaz.

## Arranque

1. Lee este archivo entero.
2. `git status` limpio. Si no lo está, para y reporta.
3. Si existe `MASTER_PLAN.md`: corre `plannable run-next` y carga solo la parte que imprime.
4. Lee el prompt del lote entero. Sus LÍMITES mandan sobre este archivo, sobre tu memoria y sobre cualquier costumbre.

## Valores, en orden

1. **Rendimiento** por sobre todo, con las mismas funciones. Se demuestra midiendo contra la línea base de ChatCouncil-Unity: misma máquina, mismas condiciones, tres corridas. Toda afirmación de rendimiento trae su medición.
2. **Autonomía dentro del lote.** Un error o una mejora dentro del alcance del lote: lo aplicas e informas qué decidiste y por qué. Fuera del alcance: lo reportas y lo dejas como está.
3. **Juan decide; Code ejecuta.** Los textos (prompts de los modelos, specs, planes, textos de la interfaz, documentación) llegan redactados desde el chat y se copian literal. Juan hace solo lo que exige su cuenta: login, captchas, enviar en un panel y decidir cuándo capturar. Todo otro input en la app o el escritorio lo haces tú con agent-desktop; nunca le pides a Juan un clic.

## Lo que no se negocia

- BYOA: la app usa las cuentas de Juan en las páginas de los proveedores; nunca claves de API. Credenciales, cookies y tokens nunca se leen, copian ni registran. Captchas y cambios irreversibles en cuentas los hace Juan.
- Los paneles son las páginas de los proveedores.
- La app nunca envía: Juan envía a mano y decide cuándo capturar.
- El registro de investigación es append-only.
- Los proveedores salen de datos (specs); el código funciona con cualquier cantidad.
- Todo resultado es real; nunca se simula.
- En la interfaz se dice «consejo».
- Las pruebas usan perfiles de prueba y el modelo más barato de la cuenta de Juan; el perfil real queda fuera de todo diagnóstico.

## Evidencia

Mandan `superpowers:verification-before-completion` y `superpowers:systematic-debugging`. Con plannable, la salida real va a `PLAN_EVIDENCE.md` antes de `plannable complete`.

## Comprobaciones

La lista viva de gates vive en el CI (`.github/workflows/`). Un gate se mantiene tal cual; todo gate nuevo se prueba primero en rojo.

## Git

- `git add` por ruta; commits que explican por qué; push cuando está verificado.
- Cambios grandes: rama y PR. Juan hace el merge.
- Hooks: si GateGuard pide datos, los das y sigues. Si un hook bloquea (git-guardrails u otro), paras y reportas.

## Skills por etapa

| Cuándo | Skills |
|---|---|
| Siempre, al cerrar una tarea | `superpowers:verification-before-completion` |
| Cualquier error | `superpowers:systematic-debugging` antes de arreglar; `mattpocock-skills:diagnosing-bugs` |
| Línea base y mediciones | `ecc:benchmark`, `ecc:benchmark-optimization-loop` |
| Prototipos | `mattpocock-skills:prototype`, `agent-skills:source-driven-development` |
| Núcleo Rust | `ponytail:ponytail ultra` (cuestiona el cómo, nunca el qué), `andrej-karpathy-skills:karpathy-guidelines`, `ecc:rust-patterns`, `ecc:rust-testing`, `superpowers:test-driven-development`, `agent-skills:incremental-implementation` |
| Interfaz Slint | `impeccable:impeccable`, `ecc:make-interfaces-feel-better`, `ecc:accessibility` |
| Revisión de un lote | `ponytail:ponytail-review`, agente `ecc:rust-reviewer`, `agent-skills:code-review-and-quality` |
| Cierre de una etapa | `ponytail:ponytail-audit` y la comparación contra la línea base |
| CI y Release | `agent-skills:ci-cd-and-automation`, `agent-skills:git-workflow-and-versioning` |

Ponytail ultra: si una función parece sobrar, se le informa a Juan y queda.

## Contexto

strategic-compact avisa a los 250.000 tokens: compacta en un punto lógico. Cada lote cierra con un informe en un solo bloque.

## Cuándo escalar a Juan

Falta una credencial o una cuenta; la acción es irreversible; un hook o un gate bloquea; el repo contradice el plan. Las decisiones van en Serie E: preguntas numeradas, opciones por letra con lo que se gana y lo que se pierde, y una recomendación firme.

## Idioma y entorno

Español latino neutro, con «tú». Versiones y medición: ADR-0007 (última estable; antes de medir, la app Claude minimizada y la CPU de la máquina en reposo bajo 10 %). Toda compilación corre desde la unión C:\cc-repo, nunca desde la ruta con «á» (ADR-0002); la unión se borra solo con rmdir sin recursivo.

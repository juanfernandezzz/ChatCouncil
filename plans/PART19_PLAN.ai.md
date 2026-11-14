@PlannablePlan v0.1

ID=PART-019
PH=E8_ENTREGA_Y_MEDICION
SCN=SCN-019
OUT=Actualizador, instalador y publicación en un Release propio; la app nueva instalada
DEP=[PART-018]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- La app nueva se publica, se instala por usuario y se actualiza como la Unity, sin tocar nada de la Unity.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E8 (parte 1 de 2)
- prior: E7 completa
- next: PART-020 comparación medida
- spec: docs/specs/E8-entrega-y-medicion.md; openspec/specs/arranque-actualizacion/spec.md; openspec/specs/diagnosticos/spec.md (DIA-004)

C:
- nombre «ChatCouncil (nueva)», AppId cl.juanfernandez.chatcouncil, instalación por usuario sin administrador, en español
- Release propio «chatcouncil-v1» en este repo; versión 0.2.<número de corrida del CI>; una compilación local es 0.1.0 y nunca ofrece actualización
- la app nunca instala sola: solo al tocar «Actualizar»
- en pruebas y con -datos de prueba no se busca actualización

F:
- crates/app/ (actualizador)
- instalador/ChatCouncilNueva.iss
- .github/workflows/

T:
1 Actualizador: al abrir, pide version.txt del Release con techo de 15 s; sin red o sin Release no muestra nada; ofrece solo si la publicada es mayor y la local no es 0.1.0; aviso, descarga con barra, «Reintentar», instalador con /SILENT y cierre, con los textos literales de ARR-008 y ARR-009.
2 Instalador con Inno Setup, como instalador/ChatCouncil.iss de la Unity: por usuario, en español, acceso directo opcional en el escritorio, sin el reinicio de Inno, relanzar la app sin elevación tras la instalación silenciosa, aviso si falta WebView2, y el acceso «ChatCouncil (depuración)» con abrir-depurando.bat (DIA-004).
3 Flujo de CI que compila en release, corre las tres pruebas internas, empaqueta el instalador y reemplaza los archivos del Release «chatcouncil-v1» (instalador y version.txt).
4 Instalar la app nueva en el PC de Juan desde el Release, en modo silencioso, y comprobar que abre con la carpeta real.

AC:
- ARR-007 (no busca actualización en pruebas), ARR-008, ARR-009, ARR-011, ARR-012, INV-ARR-001, INV-ARR-002 y DIA-004 tienen comprobación y pasan.
- El Release «chatcouncil-v1» tiene el instalador y version.txt con la versión de la corrida.
- Caso de falla: una compilación local (0.1.0) frente a un Release con versión mayor no muestra el aviso.
- El tamaño del instalador queda anotado junto al de la Unity (31.213.183 B).

V:
- cargo test --workspace y las tres pruebas internas, con su salida.
- La corrida del CI que publica, con su URL y los archivos del Release.
- La instalación en el PC de Juan: ruta, versión, sin elevación, y la app abierta con la carpeta real.

DONE:
- append PLAN_EVIDENCE.md#PART-019: summary+files+checks+notes
- run plannable complete PART-019

S:
- si publicar exige un secreto o un permiso que el repo no tiene, parar y reportar
- si el instalador pide administrador, parar y reportar

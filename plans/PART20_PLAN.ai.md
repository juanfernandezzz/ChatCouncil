@PlannablePlan v0.1

ID=PART-020
PH=E8_ENTREGA_Y_MEDICION
SCN=SCN-020
OUT=Comparación medida contra la Unity (M1, M2, M4, M5) con la máquina en reposo
DEP=[PART-019]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- Saber, medido en el mismo PC y en las mismas condiciones, si la app nueva gana a la Unity en arranque, memoria, CPU, informe y tamaño.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E8 (parte 2 de 2)
- prior: PART-019
- next: E9 recorrido real y relevo
- spec: docs/specs/E8-entrega-y-medicion.md; docs/adr/0007-versiones-y-medicion.md; bench/medir.ps1

C:
- las dos apps instaladas, cada una con su carpeta real y sus sesiones; las mismas páginas reales y la misma cantidad de paneles
- intercalado: Unity, nueva, Unity, nueva, Unity, nueva
- antes de cada corrida, la CPU de la máquina bajo 10 % durante 60 s seguidos; si no se alcanza en 30 min, esa corrida se anota como no válida y se reintenta después
- nadie pega, captura, abre ronda, recarga ni cierra sesión en ninguna de las dos
- la medición corre en un proceso separado, con Code sin trabajar

F:
- bench/medir.ps1
- bench/resultados/e8-comparacion.json

T:
1 Adaptar bench/medir.ps1 para medir las dos apps con el mismo método de E1, intercaladas, con la espera de reposo antes de cada corrida.
2 Lanzarlo en un proceso separado que sobreviva al fin del turno de Code, que escriba su avance y su resultado en archivos, y que cierre cada app con su ventana al terminar su corrida.
3 Juntar el resultado: mediana de tres por medida y por app, la diferencia, y si cada corrida fue válida.

AC:
- bench/resultados/e8-comparacion.json trae M1a, M1b, M2 (árbol y proceso propio: working set, privada y CPU) y M4 de las dos apps, con tres corridas válidas por medida y por app, y M5 (instalador) de las dos.
- Cada corrida trae la CPU de la máquina en los 60 s previos.
- Caso de falla: una corrida con la CPU de la máquina sobre 10 % no cuenta y queda anotada como no válida.
- Una medida en que la app nueva pierde se informa con su número.

V:
- bench/resultados/e8-comparacion.json y el registro de avance del proceso de medición.

DONE:
- append PLAN_EVIDENCE.md#PART-020: summary+files+checks+notes
- run plannable complete PART-020

S:
- si una medida no se puede tomar igual en las dos apps, anotar por qué y medir lo comparable; no inventar el número

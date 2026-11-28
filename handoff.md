# handoff.md · lote PART-036 (rama part-036, un solo PR)

## Estado
- La captura corre las sondas en paralelo con techo de 2 s (TECHO_SONDA, crates/app/src/interfaz.rs); cuenta mensajes de la persona (unión, closest del primer compuesto, anidados descartados); el aviso es por panel y nombra al proveedor.
- registrar_pegado ya no corta la ronda (Puerta::registrar_pegados_de_la_pregunta, ronda::pegado_sin_anotar); el informe usa las specs en uso (Puerta::usar_specs); la marca «abriendo» se suelta con la guarda Abriendo (Drop).
- B3 PARADA por falta de datos: la ronda 0e319605… no tiene salidas de operadores ni hallazgos (bench/resultados/cc2-archivos.json: salidasVigentesDeOperadores 0, hallazgosEnLaTabla 0). El integrador es solo encabezado (55 bytes, 2 líneas, sha256 0375030e…401b); el redactor no se arma por falta de informe-integrador (informe_vigente, puerta.rs). Copia sin cambios (294b4909… antes y después). GLM sin limiteArchivoBytes. Prueba #[ignore] crates/nucleo/src/medicion_cc2.rs (CC2_REGISTRO, CC2_RONDA, CC2_SALIDA).
- B1 hecha (capturas en C:\\cc-target\\tmp, fuera del repo). B2 NO se ejecutó: un rol no aparece listado sin página en la etapa Investigación (mostrar_rol y seleccionar, interfaz.rs); detalle en DESVIACIONES.md.

## Abierto para Juan
- ponytail-review: registrar_intentos con la ronda ya abierta dice «no se pudo abrir la ronda» (interfaz.rs, cierre de pedir); pegado_sin_anotar muestra un solo error; el divisor de selectores de la sonda no maneja escapes; medicion_cc2 usa SPECS_JSON embebido para el límite.
- Medición de A2: medianas 353.9 ms antes y 314.3 ms después, ruido alto, CPU 25–56 % antes de medir (sobre 10 %): orientativa; toda comparación con la Unity va a E8.

- No aplicado de la revisión: registrar_intentos que falla tras abrir_ronda dice «no se pudo abrir la ronda» (A5 cubre solo el pegado).

## Cómo retomar
Lee AGENTS.md, corre plannable run-next y revisa el informe de cierre de PART-036.

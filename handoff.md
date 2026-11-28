# handoff.md · lote PART-036 (rama part-036, un solo PR)

## Estado
- La captura corre las sondas en paralelo con techo de 2 s (TECHO_SONDA, crates/app/src/interfaz.rs); cuenta mensajes de la persona (unión, closest del primer compuesto, anidados descartados); el aviso es por panel y nombra al proveedor.
- registrar_pegado ya no corta la ronda (Puerta::registrar_pegados_de_la_pregunta, ronda::pegado_sin_anotar); el informe usa las specs en uso (Puerta::usar_specs); la marca «abriendo» se suelta con la guarda Abriendo (Drop).
- B3: bench/resultados/cc2-archivos.json (prueba #[ignore] crates/nucleo/src/medicion_cc2.rs: CC2_REGISTRO, CC2_RONDA, CC2_SALIDA). Copia sin cambios (sha256 294b4909…3e3d antes y después). Integrador: 55 bytes, 0375030e…401b. El redactor no se arma: la ronda 0e319605… no tiene informe del integrador capturado (informe_vigente, puerta.rs). GLM no tiene limiteArchivoBytes: sin porcentaje.
- B1 hecha (capturas en C:\cc-target\tmp, fuera del repo). B2 no se pudo por la interfaz (DESVIACIONES.md).

## Abierto para Juan
- ponytail-review: registrar_intentos con la ronda ya abierta dice «no se pudo abrir la ronda» (interfaz.rs, cierre de pedir); pegado_sin_anotar muestra un solo error; el divisor de selectores de la sonda no maneja escapes; medicion_cc2 usa SPECS_JSON embebido para el límite.
- Medición de A2: medianas 353.9 ms antes y 314.3 ms después, ruido alto, CPU 25–56 % antes de medir (sobre 10 %): orientativa; toda comparación con la Unity va a E8.

## Cómo retomar
Lee AGENTS.md, corre plannable run-next y revisa el informe de cierre de PART-036.

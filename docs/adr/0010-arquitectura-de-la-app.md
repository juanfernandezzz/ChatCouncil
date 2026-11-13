# ADR-0010 · Arquitectura de la app (E7)

- Estado: aceptado; se confirma o se refuta con el esqueleto de PART-011
- Fecha: 2026-11-12
- Decidió: Claude (D23)

## Contexto

El núcleo es síncrono y su Puerta no se puede mover entre hilos. Armar el informe y comprobar las URL hacen red. Slint y los webviews viven en el hilo de la interfaz. Lo que corre dentro de cada página es JavaScript. La Unity trae tres pruebas dentro de la app compilada.

## Decisión

1. Tres crates. nucleo decide. paneles es una biblioteca sobre wry y webview2-com que solo ejecuta. app es el binario con Slint, que orquesta.
2. Hilos. La Puerta se crea y vive en un hilo propio del núcleo, que recibe órdenes por un canal y responde. Cada acción de la persona (pegar, capturar, armar) se orquesta como una tarea async en el hilo de la interfaz, que espera a los paneles y al núcleo sin bloquear el dibujo. Sin tokio.
3. Script de página como dato (DAT-003). El JavaScript que la Unity inyecta se trae compilado e idéntico a datos/pagina/, con su sha256 comprobado por una prueba, como DAT-001 y DAT-002. No se reescribe.
4. Páginas de prueba como datos. Las páginas locales de las pruebas de la Unity se traen idénticas a tests/paginas/ y se sirven como cc-prueba.test y cc-otro.test.
5. Pruebas internas como criterio. -autoprueba, -pruebainterfaz y -pruebaronda se portan desde la primera parte y son la verificación de cada parte.
6. El estado sale del núcleo. La interfaz no guarda estado de la ronda: lo pide (paso_siguiente, estado_de_panel). Un error de una operación puede llegar con el hecho ya escrito, así que tras un error la interfaz vuelve a pedir el estado y nunca reintenta sola.
7. La app nunca envía. paneles no expone ninguna función de enviar, de clic ni de teclas sobre la página: solo las del script de página y las del navegador. Una prueba fija la lista de funciones del script que la app llama contra la lista permitida.
8. Credenciales. paneles no expone lectura de cookies ni de almacenamiento; solo el borrado por origen.
9. PDF. El panel del PDF con perfil propio (PAN-014) queda cumplido sin panel: el PDF lo hace typst (ADR-0003).
10. Adjuntar. Por DevTools Protocol (DOM.setFileInputFiles, ADR-0005). Sin un input de archivo en la página, el error literal «No hay un <input type=file> en la página: no se puede adjuntar.».
11. Nombre. El binario se llama ChatCouncilNueva.exe y la ventana «ChatCouncil (nueva)» hasta el relevo (E9), para distinguirla de la Unity al medir.

## Consecuencias

- El script de página no se puede cambiar desde este repo sin traer su fuente y su compilación; si el paso 1 lo necesita, se decide entonces.
- Las pruebas internas viajan dentro del ejecutable, como en la Unity; su peso se mide.
- El lector de pantalla usa la accesibilidad nativa de Slint, no el sondeo de 0,5 s de la Unity; lo observable de IFZ-020 a IFZ-022 se mantiene.

## Qué la revisaría

Que el esqueleto muestre que Slint y wry no comparten bien la ventana, el foco o el bucle de eventos; que el hilo del núcleo agregue una espera visible; o que el script de página no se pueda traer idéntico.

## Enmienda · 2026-11-13 · D25 · Corrige el punto 10

El punto 10 fijaba DOM.setFileInputFiles sin haber leído Paneles.cs. En la Unity el archivo se suelta sobre el compositor con un arrastre simulado (PAN-013), y Gemini, Mistral y Qwen lo necesitan. La app adjunta por arrastre simulado, por un solo camino. Sin compositor, el error literal «No está el compositor: no hay dónde soltar el archivo.».

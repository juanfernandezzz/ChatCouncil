# Requisitos fuera de E6 (D18)

Cada requisito e invariante de openspec tiene un solo destino (D18). Aquí van los que no son de una parte de E6; los de E6 están en los AC de plans/PART*_PLAN.ai.md.

## E7 · interfaz, paneles y webviews (98)

- ARR-001 · arranque-actualizacion · Carpeta de datos: arranque de la app (Aplicacion.cs). → PART-011
- ARR-002 · arranque-actualizacion · Primer arranque guiado: arranque de la app (Aplicacion.cs). → PART-014
- ARR-004 · arranque-actualizacion · Specs en caliente: arranque de la app (Aplicacion.cs). → PART-014
- ARR-005 · arranque-actualizacion · Tope de 60 cuadros por segundo: arranque de la app (Aplicacion.cs). → PART-011
- ARR-006 · arranque-actualizacion · Escala física: arranque de la app (Aplicacion.cs). → PART-011
- ARR-007 · arranque-actualizacion · Las pruebas nunca usan la carpeta real ni buscan actualización: arranque de la app (Aplicacion.cs). → PART-011
- CAP-001 · captura · Leer la última respuesta con su HTML crudo: lectura en la página o la interfaz. → PART-013
- CAP-002 · captura · Informe en iframe: lectura en la página o la interfaz. → PART-013
- CAP-003 · captura · Capturar los seleccionados en paralelo: lectura en la página o la interfaz. → PART-015
- CAP-014 · captura · Estado de generación sin inventar: lectura en la página o la interfaz. → PART-013
- INV-CAP-002 · captura · Capturar lo decide la persona: lectura en la página o la interfaz. → PART-015
- INV-CAP-003 · captura · Sin dato de la página no se inventa estado: lectura en la página o la interfaz. → PART-013
- ESC-001 · escritura-compositor · Escribir sin pisar un borrador: escritura en el compositor de la página o flujo de la interfaz. → PART-013
- ESC-002 · escritura-compositor · Saltos CRLF normalizados: escritura en el compositor de la página o flujo de la interfaz. → PART-013
- ESC-003 · escritura-compositor · Escritura por execCommand en tramos: escritura en el compositor de la página o flujo de la interfaz. → PART-013
- ESC-004 · escritura-compositor · Espera a que el texto asiente y verifica: escritura en el compositor de la página o flujo de la interfaz. → PART-013
- ESC-005 · escritura-compositor · Pegar la pregunta en todos a la vez: escritura en el compositor de la página o flujo de la interfaz. → PART-015
- ESC-006 · escritura-compositor · Repegar en un panel sin duplicar: escritura en el compositor de la página o flujo de la interfaz. → PART-015
- ESC-007 · escritura-compositor · Conversación nueva comprobada vacía antes de operación y roles: escritura en el compositor de la página o flujo de la interfaz. → PART-016
- ESC-008 · escritura-compositor · Aviso de operación una vez por ronda: escritura en el compositor de la página o flujo de la interfaz. → PART-016
- ESC-009 · escritura-compositor · Operación de a un panel, al frente: escritura en el compositor de la página o flujo de la interfaz. → PART-016
- ESC-012 · escritura-compositor · Adjunto después del texto: escritura en el compositor de la página o flujo de la interfaz. → PART-016
- INV-ESC-001 · escritura-compositor · La app nunca envía: escritura en el compositor de la página o flujo de la interfaz. → PART-013
- INV-ESC-002 · escritura-compositor · Nunca se escribe encima de un borrador: escritura en el compositor de la página o flujo de la interfaz. → PART-013
- INV-ESC-003 · escritura-compositor · Pegado se verifica, no se asume: escritura en el compositor de la página o flujo de la interfaz. → PART-013
- INT-004 · integrador · Pegar el prompt del integrador: flujo de pegado en la interfaz. → PART-016
- INV-INT-002 · integrador · Nunca se pega un prompt vacío: flujo de pegado en la interfaz. → PART-016
- IFZ-001 · interfaz · Siete etapas y título de la barra: interfaz. → PART-015
- IFZ-002 · interfaz · Palabra de estado de cada panel: interfaz. → PART-015
- IFZ-003 · interfaz · Contadores de la investigación: interfaz. → PART-015
- IFZ-004 · interfaz · Filas de los roles: interfaz. → PART-016
- IFZ-005 · interfaz · Cabecera y selector del panel visible: interfaz. → PART-015
- IFZ-006 · interfaz · El paso imposible queda deshabilitado: interfaz. → PART-015
- IFZ-007 · interfaz · Resultado anunciado al lector de pantalla: interfaz. → PART-015
- IFZ-008 · interfaz · Teclado de una mano F1 a F5: interfaz. → PART-017
- IFZ-009 · interfaz · Ctrl+Tab entre paneles: interfaz. → PART-017
- IFZ-010 · interfaz · Regiones con F4 y F5, incluida la página nativa: interfaz. → PART-017
- IFZ-011 · interfaz · Menú contextual nativo del campo de la pregunta: interfaz. → PART-017
- IFZ-012 · interfaz · Asa para cambiar el alto del campo: interfaz. → PART-015
- IFZ-013 · interfaz · Clases de ancho y cajón: interfaz. → PART-014
- IFZ-014 · interfaz · Historial de rondas: interfaz. → PART-014
- IFZ-016 · interfaz · Versión y licencias en Ayuda: interfaz. → PART-014
- IFZ-017 · interfaz · Menús propios con grupos y motivos: interfaz. → PART-017
- IFZ-018 · interfaz · Ítems del menú del panel: interfaz. → PART-017
- IFZ-019 · interfaz · Ítems del menú Ronda y mantenimiento: interfaz. → PART-017
- IFZ-020 · interfaz · Jerarquía para el lector de pantalla: interfaz. → PART-017
- IFZ-021 · interfaz · Lo que dice el lector de cada control: interfaz. → PART-017
- IFZ-022 · interfaz · Activar un control desde el lector: interfaz. → PART-017
- IFZ-023 · interfaz · Símbolo dibujado de cada estado: interfaz. → PART-015
- IFZ-024 · interfaz · Diálogo propio con Cancelar: interfaz. → PART-015
- INV-IFZ-001 · interfaz · Una acción deshabilitada nunca queda sin motivo visible: interfaz. → PART-017
- INV-IFZ-002 · interfaz · Las teclas de la app nunca le quitan Alt+F4 al sistema: interfaz. → PART-017
- INV-IFZ-003 · interfaz · Un menú nunca se abre fuera de la vista: interfaz. → PART-017
- INV-IFZ-004 · interfaz · Un texto que cambia nunca rearma la jerarquía del lector: interfaz. → PART-017
- INV-IFZ-005 · interfaz · La página nativa nunca entra en la jerarquía de la app: interfaz. → PART-017
- INV-IFZ-006 · interfaz · El estado nunca se distingue solo por color: interfaz. → PART-015
- INV-IFZ-007 · interfaz · Un diálogo cerrado nunca deja su acción: interfaz. → PART-015
- PAN-001 · paneles-sesiones · Un navegador compartido en la carpeta de datos: paneles y webviews. → PART-011
- PAN-002 · paneles-sesiones · Un solo perfil para los proveedores: paneles y webviews. → PART-012
- PAN-003 · paneles-sesiones · Creación de panel con techo de 90 s: paneles y webviews. → PART-012
- PAN-004 · paneles-sesiones · Ventanas emergentes en el mismo perfil: paneles y webviews. → PART-012
- PAN-005 · paneles-sesiones · Cierres de sesión bloqueados salvo clic de la persona: paneles y webviews. → PART-012
- PAN-006 · paneles-sesiones · Estado de sesión por el compositor: paneles y webviews. → PART-014
- PAN-007 · paneles-sesiones · Entrar a una cuenta desde Ajustes: paneles y webviews. → PART-014
- PAN-008 · paneles-sesiones · Recargar la página: paneles y webviews. → PART-017
- PAN-009 · paneles-sesiones · Cerrar la sesión de un panel: paneles y webviews. → PART-017
- PAN-010 · paneles-sesiones · Agregar una cuenta de Google: paneles y webviews. → PART-017
- PAN-011 · paneles-sesiones · Paneles ocultos fuera de la ventana, no a 0x0: paneles y webviews. → PART-012
- PAN-012 · paneles-sesiones · El teclado no queda atrapado en la página: paneles y webviews. → PART-012
- PAN-013 · paneles-sesiones · Adjuntar archivo al compositor: paneles y webviews. → PART-012
- PAN-014 · paneles-sesiones · Panel del PDF con perfil propio: paneles y webviews. → PART-012
- PAN-015 · paneles-sesiones · Título y fallo del cierre de sesión: paneles y webviews. → PART-017
- INV-PAN-001 · paneles-sesiones · Nunca se leen cookies ni almacenamiento: paneles y webviews. → PART-012
- INV-PAN-002 · paneles-sesiones · El user agent nunca se cambia: paneles y webviews. → PART-011
- INV-PAN-003 · paneles-sesiones · Cerrar sesión nunca toca a los demás: paneles y webviews. → PART-012
- PRU-001 · pruebas-internas · Autoprueba del panel por línea de comandos: autopruebas de la app y los paneles. → PART-011
- PRU-002 · pruebas-internas · Autoprueba: panel básico: autopruebas de la app y los paneles. → PART-012
- PRU-003 · pruebas-internas · Autoprueba: escritura con las specs reales: autopruebas de la app y los paneles. → PART-013
- PRU-004 · pruebas-internas · Autoprueba: lectura y diagnóstico: autopruebas de la app y los paneles. → PART-013
- PRU-005 · pruebas-internas · Autoprueba: iframe, compositor recortado, adjunto y PDF: autopruebas de la app y los paneles. → PART-013
- PRU-006 · pruebas-internas · Autoprueba: perfiles: autopruebas de la app y los paneles. → PART-012
- PRU-007 · pruebas-internas · Autoprueba: techo externo: autopruebas de la app y los paneles. → PART-012
- PRU-008 · pruebas-internas · Autoprueba: texto Unicode por el puente: autopruebas de la app y los paneles. → PART-013
- PRU-009 · pruebas-internas · Prueba de la interfaz en tres fases: autopruebas de la app y los paneles. → PART-014
- PRU-010 · pruebas-internas · Prueba de la interfaz: fase 1: autopruebas de la app y los paneles. → PART-014
- PRU-011 · pruebas-internas · Prueba de la interfaz: fases 2 y 3: autopruebas de la app y los paneles. → PART-014
- PRU-012 · pruebas-internas · Prueba de la ronda por línea de comandos: autopruebas de la app y los paneles. → PART-015
- PRU-013 · pruebas-internas · Prueba de la ronda: Pregunta e Investigación: autopruebas de la app y los paneles. → PART-015
- PRU-014 · pruebas-internas · Prueba de la ronda: Operación: autopruebas de la app y los paneles. → PART-016
- PRU-015 · pruebas-internas · Prueba de la ronda: roles e informe: autopruebas de la app y los paneles. → PART-016
- PRU-016 · pruebas-internas · Prueba de la ronda: diálogo, abandonar y declarar: autopruebas de la app y los paneles. → PART-015
- PRU-017 · pruebas-internas · Prueba de la ronda: secciones, accesibilidad y teclado: autopruebas de la app y los paneles. → PART-017
- PRU-018 · pruebas-internas · Copias de evidencia de la prueba de la ronda: autopruebas de la app y los paneles. → PART-016
- INV-PRU-001 · pruebas-internas · La autoprueba nunca usa la carpeta ni los perfiles reales: autopruebas de la app y los paneles. → PART-011
- INV-PRU-002 · pruebas-internas · Las copias de evidencia nunca llevan el perfil del navegador: autopruebas de la app y los paneles. → PART-016
- INV-PRU-003 · pruebas-internas · Una medición nunca cuenta para el resultado: autopruebas de la app y los paneles. → PART-011
- VER-002 · verificadores · El mismo prompt a los dos verificadores: flujo de la interfaz. → PART-016
- VER-008 · verificadores · Repetir la verificación de un panel: flujo de la interfaz. → PART-016

## E8 · medición y entrega (6)

- ARR-008 · arranque-actualizacion · Buscar versión nueva al abrir: actualización e instalador: entrega.
- ARR-009 · arranque-actualizacion · Instalar la actualización en Windows: actualización e instalador: entrega.
- ARR-011 · arranque-actualizacion · Instalador sin administrador y en español: actualización e instalador: entrega.
- ARR-012 · arranque-actualizacion · Aviso si falta WebView2: actualización e instalador: entrega.
- INV-ARR-001 · arranque-actualizacion · La app nunca instala sola: actualización e instalador: entrega.
- INV-ARR-002 · arranque-actualizacion · Una compilación local nunca ofrece actualización: actualización e instalador: entrega.

## E9 · relevo (0)

- Ninguno.

## Segunda pasada · solo Android (2)

- ARR-010 · arranque-actualizacion · Actualización en Android: solo Android.
- IFZ-015 · interfaz · Historial en Android dice dónde está el informe: solo Android.

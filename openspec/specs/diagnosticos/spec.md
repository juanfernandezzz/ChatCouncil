# Diagnósticos

Propósito: dar a la persona, sin leer datos de cuenta, lo necesario para corregir selectores de un proveedor o inspeccionar los paneles cuando algo falla.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### DIA-001 · Diagnóstico de selectores de solo lectura
- Qué hace: el script de página cuenta cuántas coincidencias da cada selector de la spec (o «invalido» si el selector no compila) y describe con atributos estructurales los cuadros de texto, contenedores de texto largo, controles cerca del compositor, iframes y shadow roots; no lee valores de campos y recorta todo texto a 80 caracteres.
- Condición y resultado observable: el JSON de diagnóstico trae `composer.selector` y `assistantMessage.selector` con su conteo.
- Fuente: pagina/src/pagina.ts:480-500 ; pagina/src/pagina.ts:582-583
- Prueba: manual — 1. Con un perfil de prueba, abrir «Más…» en un panel. 2. Tocar «Diagnóstico de selectores». 3. Abrir el JSON y comprobar los conteos y que ningún valor de campo aparece.
- Plataforma: ambas

### DIA-002 · Archivo de diagnóstico en la carpeta de datos
- Qué hace: guarda `diagnosticos/{proveedor}-{yyyy-MM-dd-HHmmss}.json` (UTF-8 sin BOM, con sangría) con `proveedor`, `app` (versión) y `diagnostico`, y abre la carpeta (D18); el script tiene 30 s.
- Condición y resultado observable: mensaje «Diagnóstico de {nombre} guardado en {ruta}. Mándalo junto con lo que pasó para que se corrijan los selectores.»; si falla, «No se pudo hacer el diagnóstico de {nombre}: {error}».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1273-1294
- Prueba: manual — 1. Igual que DIA-001. 2. Comprobar que se abre la carpeta `diagnosticos` con el archivo nuevo y el mensaje.
- Plataforma: ambas

### DIA-003 · Diagnóstico solo con la página abierta
- Qué hace: el ítem «Diagnóstico de selectores» queda deshabilitado con el motivo «El panel no tiene su página abierta.» si el panel no abrió.
- Condición y resultado observable: en un panel que falló al abrir, el ítem se ve deshabilitado con ese motivo.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1219-1232
- Prueba: manual — 1. Abrir la app sin red con un perfil de prueba. 2. Abrir «Más…» en un panel que no cargó. 3. Comprobar el motivo.
- Plataforma: ambas

### DIA-004 · Acceso directo de depuración
- Qué hace: el instalador agrega `abrir-depurando.bat` y el acceso «ChatCouncil (depuración)», que abre la app con el puerto local de WebView2 para inspeccionar los paneles.
- Condición y resultado observable: el menú Inicio tiene «ChatCouncil (depuración)».
- Fuente: instalador/ChatCouncil.iss:37-42
- Prueba: manual — 1. Instalar en un usuario de prueba. 2. Buscar «ChatCouncil (depuración)» en el menú Inicio. 3. Abrirlo y comprobar que la app arranca.
- Plataforma: windows

### DIA-005 · Errores de la página con instrucción
- Qué hace: cuando la página no se pudo abrir, la cabecera del panel dice «La página no se pudo abrir: {f} Prueba Más… → Recargar la página.».
- Condición y resultado observable: un panel que no cargó muestra ese texto en su cabecera.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:357-360
- Prueba: manual — 1. Abrir la app sin red con un perfil de prueba. 2. Comprobar la cabecera del panel.
- Plataforma: ambas

## Invariantes

### INV-DIA-001 · El diagnóstico nunca lee datos de la cuenta
- Qué nunca pasa: el diagnóstico incluye valores de campos, cookies, tokens o almacenamiento, o textos de más de 80 caracteres.
- Fuente: pagina/src/pagina.ts:489-495 ; pagina/src/pagina.ts:6-10
- Prueba: nueva — correr `diagnostico` del script de página sobre una página de prueba con un campo con valor «secreto» y comprobar que el JSON no lo contiene.

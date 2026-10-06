# Fase 6: ¿puede Unity embeber un navegador con las cuatro capacidades?

Investigación del 2026-10-04 (sección 2 de `docs/FASE6-HANDOFF.md`). No se escribió código de la app.

**Cómo leer este documento.** Cada afirmación lleva una de estas tres marcas:

- **[DOC]**: lo dice la fuente primaria citada (documentación oficial, código fuente o especificación).
- **[INF]**: lo infiero a partir de fuentes citadas; es razonable, pero no está escrito tal cual.
- **[PRUEBA]**: no lo verifiqué y hay que medirlo en tu máquina o en tu teléfono.

**Aquí no se midió nada.** No hay Unity, Android ni cuentas en este entorno. No hay ningún número medido. Las cifras que aparecen son de documentación y se citan como tales.

---

## 1. Respuesta corta

**Veredicto global: sí, con condiciones, en las dos plataformas.** Ningún paquete de Unity trae las cuatro capacidades listas en Windows y Android a la vez. Las APIs nativas de cada plataforma sí las cubren, salvo dos riesgos que ninguna opción elimina:

- **el login de Google (Gemini)** en navegadores embebidos;
- **la confiabilidad de la entrada en Android**, que es inferida y no está documentada.

### Por capacidad y plataforma (mejor opción de cada plataforma)

| Capacidad | Windows (WebView2 por plugin propio; o CEF directo) | Android (android.webkit.WebView + androidx.webkit por plugin propio) |
|---|---|---|
| a) 9 sesiones persistentes, aisladas y simultáneas | **Sí [DOC]**: perfiles de WebView2 (`ProfileName`) bajo una sola carpeta de datos; con CEF, `CefRequestContextSettings.cache_path` por sesión | **Sí, con condiciones [DOC]**: `ProfileStore` / `WebViewCompat.setProfile` (androidx.webkit ≥ 1.9.0). Requiere que el WebView instalado soporte `MULTI_PROFILE`, lo que se comprueba en tiempo de ejecución **[PRUEBA]** |
| b) leer el DOM con selectores y devolver el resultado a C# | **Sí [DOC]**: `ExecuteScriptAsync` devuelve JSON; CEF lo hace por CDP (`Runtime.evaluate`) | **Sí [DOC]**: `evaluateJavascript(script, callback)` devuelve el resultado |
| c) inyectar texto en el compositor | **Sí [DOC]**: CDP `Input.insertText` / `Input.dispatchKeyEvent` vía `CallDevToolsProtocolMethodAsync` | **Sí [DOC]** en la API (`WebView.dispatchKeyEvent`, `InputConnection.commitText`); falta comprobar que funcione en ProseMirror y Lexical **[PRUEBA]** |
| d) entrada confiable (`isTrusted === true`) | **Sí [INF fuerte]**: es el mismo mecanismo que `sendInputEvent` / `insertText` de Electron, que ya mediste con `isTrusted=true` | **Probable [INF]**: la tecla entra por el pipeline nativo de Chromium (`ImeAdapterImpl`). No hay documento que lo afirme **[PRUEBA]** |
| Pegado confiable (editores que pierden saltos de línea) | **Probable [INF]**: `Input.dispatchKeyEvent` con `commands:["paste"]` (parámetro experimental) o Ctrl+V nativo **[PRUEBA]** | **Probable [INF]**: portapapeles del sistema + tecla Ctrl+V / `KEYCODE_PASTE` por `dispatchKeyEvent` **[PRUEBA]** |
| Login de Google (Gemini) | **Riesgo alto [DOC]**: Google bloquea el login en "embedded browser frameworks" como CEF | **Riesgo alto [DOC]**: Google bloquea OAuth en Android WebView y el login en navegadores "embedded in a different application" |

### Por opción evaluada

Leyenda: ✔ documentado · ~ con condiciones o inferido · ✘ no · ? no documentado

| Opción | Windows | Android | a | b | c | d | Estado |
|---|---|---|---|---|---|---|---|
| Vuplex 3D WebView | Sí (Chromium 137 vía CEF) | Sí (System WebView o Gecko) | Windows ✘/? (una sola `CachePath` global); Android ? (sin API; posible con `GetNativeWebView()` **[PRUEBA]**) | ✔ | ✔ | Windows ~ (`SendDevToolsMessage` → CDP); Android ? | Comercial, activo |
| Unity Web Browser (UWB) | Sí (CEF) | **No** (solo escritorio) | ✔ (un proceso de motor por `cache-path`) | ~ (`ExecuteJs` no devuelve valor) | ~ (`SendKeyEvent`) | ~ (CEF nativo **[INF]**) | MIT, v2.2.8 (2026-01-07) |
| ZFBrowser (Embedded Browser) | — | — | — | — | — | — | **Retirado del Asset Store** |
| gree/unity-webview | Sí (WebView2, capturado a textura) | Sí (android.webkit.WebView) | ✘ (carpeta y perfil únicos) | ~ (sin valor de retorno directo) | ~ | ~ (Windows: mensajes Win32 **[INF]**) | Zlib, último commit 2026-09-25 |
| UniWebView | **No** | Sí | ? | ✔ | ? | ? | Comercial; solo iOS/Android |
| Mixed Reality WebView (Microsoft) | Solo HoloLens 2 | No | — | — | — | — | **Discontinuado** |
| WebView2 por plugin propio | Sí | No | ✔ | ✔ | ✔ | ✔ **[INF fuerte]** | Microsoft, activo |
| Android WebView por plugin propio | No | Sí | ✔ (con `MULTI_PROFILE`) | ✔ | ✔ | ~ **[INF]** | Google, activo (androidx.webkit 1.17.1, 2026-09-23) |
| CEF directo | Sí | **No** | ✔ | ✔ | ✔ | ✔ **[INF fuerte]** | BSD, rama estable 154 |

---

## 2. Detalle por opción

### 2.0 La regla de `isTrusted`, que vale para todas las opciones

- **Qué dice la especificación.** El DOM Standard dice que `isTrusted` "indicates whether an event is dispatched by the user agent (as opposed to using `dispatchEvent()`)", y que al crear un evento el atributo se inicializa en `false` **[DOC]** (https://dom.spec.whatwg.org/#dom-event-istrusted). La única excepción heredada es `click()`.
  - Consecuencia: todo lo que se haga desde JavaScript inyectado (`dispatchEvent`, `new KeyboardEvent`, `new ClipboardEvent('paste')`) llega con `isTrusted=false`.
- **Qué hace CDP.** `Input.insertText` "emulates inserting text that doesn't come from a key press, for example an emoji keyboard or an IME" (es experimental). `Input.dispatchKeyEvent` "Dispatches a key event to the page" y tiene un parámetro `commands` ("Editing commands to send with the key event (e.g., 'selectAll')", también experimental) **[DOC]** (https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Input.pdl).
  - Estos métodos inyectan la entrada en el pipeline del navegador, no en el DOM. Por eso es el agente de usuario quien despacha el evento, y por la regla del DOM Standard llega como confiable **[INF fuerte]**.
  - Electron `webContents.sendInputEvent` / `insertText` usan ese mismo camino, y en Electron ya mediste `isTrusted=true`.
- **Qué falta medir.** Tienes que confirmarlo en cada plataforma con la página de prueba de la sección 4 **[PRUEBA]**.

### 2.1 Vuplex 3D WebView

**Producto y precio**

- Paquetes separados por plataforma: "Windows + Mac", "Android", "Android Gecko", iOS, visionOS, WebGL y UWP. Rango de precio de USD 129,99 a 229,99, con hasta 20 % de descuento en bundle **[DOC]** (https://store.vuplex.com/).
- Windows+Mac y Android cuestan USD 159,99 cada uno **[DOC]** (https://store.vuplex.com/webview/windows-mac, https://store.vuplex.com/webview/android).
- Licencia: "Vuplex Commercial Library License", y en Windows exige mostrar la licencia de CEF **[DOC]** (mismas URLs).

**Motores**

- Windows usa "Chromium version 137" (la licencia CEF confirma que es CEF) **[DOC]** (https://store.vuplex.com/webview/windows-mac).
- Android usa "the Android System WebView" **[DOC]** (https://store.vuplex.com/webview/android).

**Mantenimiento**

- Vuplex anunció la v4.14 (https://bsky.app/profile/vuplex.com/post/3m76ksqjkws26). No pude leer la fecha porque la página de releases de Vuplex devolvió 403/contenido vacío. **Fecha del último release: no verificada.**
- Chromium 137 está bastante por detrás de la rama estable actual de CEF (154) **[DOC]** (https://chromiumembedded.github.io/cef/branches_and_building).

**Capacidades**

- **b)** `Task<string> ExecuteJavaScript(string)` devuelve el resultado **[DOC]** (https://developer.vuplex.com/webview/IWebView).
- **c)**
  - `SendKey(string key)` "Dispatches the given keyboard key to the webview". `HandleKeyboardInput` es el nombre anterior (obsoleto desde la v4.0). También existe `Paste()`: "Pastes text from the clipboard" **[DOC]** (https://developer.vuplex.com/webview/IWebView).
  - `KeyDown/KeyUp` con modificadores existen solo en `StandaloneWebView` (Windows/macOS), `AndroidGeckoWebView` y `MacWebKitWebView`. **No existen en `AndroidWebView`** **[DOC]** (https://developer.vuplex.com/webview/IWithKeyDownAndUp).
- **d)**
  - La documentación no dice si `SendKey` produce `isTrusted=true` **[DOC: ausencia]**.
  - En Windows hay `StandaloneWebView.SendDevToolsMessage`, que envía JSON de CDP **[DOC]** (https://developer.vuplex.com/webview/StandaloneWebView). Eso permite usar `Input.insertText` y `Input.dispatchKeyEvent`, así que d) es alcanzable en Windows **[INF fuerte]**.
  - En Android no hay CDP; depende de cómo implemente `SendKey`, que no está documentado **[PRUEBA]**.
- **a) Aislamiento: aquí falla Vuplex en Windows.**
  - `StandaloneWebView.CachePath` es una propiedad **estática**, una sola por proceso de Chromium, y "cannot be set while the Chromium browser process is running" **[DOC]** (https://developer.vuplex.com/webview/StandaloneWebView).
  - La caché guarda "cookies, localStorage, and its HTTP cache" y "only one instance at a time can use a given browser cache directory" **[DOC]** (https://support.vuplex.com/articles/multiple-app-instances/).
  - `Web.ClearAllData()` / `Web.CookieManager` son globales **[DOC]** (https://developer.vuplex.com/webview/Web).
  - No hay API de perfiles ni de request contexts por webview **[DOC: ausencia]**.
  - `SetStorageEnabled(false)` da modo incógnito, que **no persiste** **[DOC]** (https://developer.vuplex.com/webview/Web).
  - En Android, `AndroidWebView.GetNativeWebView()` entrega el `android.webkit.WebView` real **[DOC]** (https://developer.vuplex.com/webview/AndroidWebView). En teoría puedes llamar a `WebViewCompat.setProfile` sobre él, pero solo antes de cualquier navegación o `evaluateJavascript` (ver 2.6). Si Vuplex navega o evalúa JavaScript al inicializar, no funciona **[PRUEBA]**.
- **Varias vistas a la vez.** Vuplex dice que una app "can usually have 10 active webviews on Windows, macOS, and Android without performance issues" **[DOC]** (https://support.vuplex.com/articles/multiple-webviews/). Es una afirmación del fabricante, no una medición tuya.
- **Visibilidad.** `AndroidWebView.Pause()` / `PauseAll()` pausan el render, pero `PauseAll` "does not pause JavaScript" **[DOC]** (https://developer.vuplex.com/webview/AndroidWebView). Vuplex renderiza a textura (fuera de pantalla). No está documentado cómo reporta eso `document.visibilityState` **[PRUEBA]**.

**Observación de diseño (no es una decisión).** Los 9 sitios son dominios distintos, así que un almacén de cookies compartido no mezcla sus sesiones por origen. Lo que sí se compartiría es la sesión de Google ("Sign in with Google") y cualquier tercero común. Si ese aislamiento parcial alcanza o no lo decides tú. Copiar o intercambiar cookies a mano para simular perfiles queda **descartado**, porque viola la regla dura de no leer ni copiar cookies de Juan (FASE6-HANDOFF §6).

### 2.2 Unity Web Browser (UWB, Voltstro)

- **Licencia y plataformas.** MIT, "Multi-Platform Desktop Support (Windows, Linux & MacOS)". Usa un motor CEF fuera de proceso **[DOC]** (https://github.com/Voltstro-Studios/UnityWebBrowser). Los paquetes de motor del repositorio son `Win-x64`, `Linux-x64`, `MacOS-x64` y `MacOS-arm64`. **No hay Android** **[DOC: código]**.
- **Mantenimiento.** Último release en GitHub: 2.2.8, del 2026-01-07. Último push: 2026-06-18 **[DOC]** (API de GitHub, `repos/Voltstro-Studios/UnityWebBrowser`).
- **a)** Cada `WebBrowserClient` lanza su proceso de motor con el argumento `cache-path` (`WebBrowserClient.cs:416-419`). Del lado CEF hay `RootCachePath = cachePath` y `CachePath = <cachePath>/UserDefaultCache`, o incógnito (`CefEngineControlsManager.cs:120-168`) **[DOC: código]**.
  - Con una ruta distinta por cliente, las 9 sesiones quedan aisladas y persisten, pero son **9 procesos de navegador Chromium completos** (costo de memoria) **[INF]**.
- **b)** `ExecuteJs(string js)` es `void` y llama a `ExecuteJavaScript(js, "", 0)` de CEF, que no devuelve valor (`WebBrowserClient.cs:924`, `UwbCefClient.cs:332`) **[DOC: código]**. Para leer el DOM hay que devolver el dato por los métodos JS→C# registrados (`JsMethodManager`) **[DOC: código]**.
- **c, d)** El teclado entra por `browserHost.SendKeyEvent(keyEvent)` (`UwbCefClient.cs:171-198`) **[DOC: código]**. Eso es entrada nativa de CEF, así que es confiable **[INF]**. No se expone CDP (no encontré `SendDevToolsMessage`), así que `insertText` requiere bifurcar el motor **[DOC: código]**.

### 2.3 ZFBrowser (Embedded Browser)

- El Asset Store dice: "This asset has been deprecated from the Unity Asset Store. It is no longer available for purchase and will no longer be supported by the publisher." **[DOC]** (https://assetstore.unity.com/packages/tools/gui/embedded-browser-55459).
- **Descartado.**

### 2.4 gree/unity-webview

- **Licencia y mantenimiento.** Zlib, último commit 2026-09-25 ("update binaries") **[DOC]** (https://github.com/gree/unity-webview; API de GitHub).
- **Plataformas.** Android, iOS, Mac, Windows (editor y standalone) y WebGL. Windows usa Microsoft WebView2, "rendered offscreen and displayed as a texture" **[DOC]** (README).
- **Windows (código)**
  - La textura sale de Windows Graphics Capture, con `CapturePreview` (PNG) como respaldo. El propio código dice "On Windows, CapturePreview is heavy" (`WebViewObject.cs:2326`, `WebViewPlugin.cpp:955`) **[DOC: código]**.
  - La carpeta de datos es única y fija: `%LOCALAPPDATA%\UnityWebView2`. No usa perfiles **[DOC: código]**.
  - El teclado se envía como mensajes Win32 a la ventana hija de WebView2 (`WM_WEBVIEW_SEND_KEY`) **[DOC: código]**. Llega como entrada del sistema, por lo tanto confiable **[INF]**.
  - Evalúa JS con `ExecuteScript` **[DOC: código]**.
- **Android (código).** Usa `android.webkit.WebView` con `CookieManager.getInstance()`, o sea el perfil por defecto compartido. `evaluateJavascript(js, null)` no devuelve valor (el resultado vuelve por mensaje) (`CWebViewPlugin.java:1109`) **[DOC: código]**. La opción `separated` solo aplica al editor de Mac **[DOC]** (README).
- **Conclusión.** No cumple a) sin modificarlo. Sirve como **código de referencia con licencia Zlib** para un plugin propio de WebView2 en Unity.

### 2.5 UniWebView

- "UniWebView only works on these two platforms" (iOS y Android), más soporte del editor en macOS. **No hay Windows** **[DOC]** (https://docs.uniwebview.com/guide/installation.html).
- **Descartado** para un build de PC.

### 2.6 Android System WebView por plugin propio (androidx.webkit)

**a) Aislamiento**

- androidx.webkit 1.9.0 (29-nov-2023) "Added a new multi-profile API for WebViews". Cada `Profile` tiene su propio `CookieManager`, `WebStorage`, `ServiceWorkerController` y `GeolocationPermissions`, y "information is not shared between different profiles in the application" **[DOC]** (https://developer.android.com/jetpack/androidx/releases/webkit).
- `ProfileStore` (Added in 1.9.0, `@UiThread`) ofrece `getInstance()`, `getOrCreateProfile`, `getAllProfileNames` y `deleteProfile` **[DOC]** (https://developer.android.com/reference/androidx/webkit/ProfileStore).
- `WebViewCompat.setProfile(WebView, String)` (Added in 1.9.0) "should be called before doing anything else with WebView other than attaching it to the view hierarchy" **[DOC]** (https://developer.android.com/reference/androidx/webkit/WebViewCompat). Lanza `IllegalStateException`:
  - si ya navegó;
  - si se llamó `evaluateJavascript` antes;
  - si el perfil ya estaba fijado.
- La disponibilidad depende del WebView instalado: `WebViewFeature.MULTI_PROFILE`, con `UnsupportedOperationException` si no lo soporta **[DOC]** (https://developer.android.com/reference/androidx/webkit/WebViewFeature). Versión estable actual de androidx.webkit: **1.17.1 (2026-09-23)** **[DOC]** (página de releases).
- **Alternativa vieja: `WebView.setDataDirectorySuffix`.** Es "for the current process" y "Each directory can be used by only one process". Para 9 sesiones aisladas harían falta **9 procesos de la app** **[DOC]** (https://developer.android.com/reference/android/webkit/WebView). Es inviable dentro de una app Unity de un proceso **[INF]**.

**b) Lectura del DOM.** `evaluateJavascript(String script, ValueCallback<String> resultCallback)` "Asynchronously evaluates JavaScript … resultCallback will be invoked with any result" y debe llamarse en el hilo de UI **[DOC]** (misma URL de WebView).

**c, d) Entrada**

- `WebView.dispatchKeyEvent` entra en `ImeAdapterImpl.dispatchKeyEvent` → `sendKeyEvent` → código nativo de Chromium. `commitText` del IME también pasa por `ImeAdapterImpl` **[DOC: código]** (https://raw.githubusercontent.com/chromium/chromium/main/content/public/android/java/src/org/chromium/content/browser/input/ImeAdapterImpl.java, líneas 1172, 1425, 2270).
- Blink crea el `KeyboardEvent` en `KeyboardEventManager` como evento despachado por el agente de usuario **[DOC: código]** (https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/input/keyboard_event_manager.cc). Por lo tanto `isTrusted=true` **[INF]**.
- No hay documento oficial que lo diga **[PRUEBA]**.
- Requiere que el WebView tenga el foco **[INF]**.

**Sin CDP dentro de la app.** Android WebView no expone `Input.insertText` como API pública; solo existe la depuración remota (`setWebContentsDebuggingEnabled`) para herramientas externas **[INF]**.

**Procesos.** El código del navegador de WebView corre en el proceso de la app. El renderer va en un proceso aislado (sandbox), y GPU y red corren en el proceso de la app **[DOC]** (https://raw.githubusercontent.com/chromium/chromium/main/android_webview/docs/architecture.md).

### 2.7 Windows WebView2 por plugin propio

**a) Aislamiento**

- "Each profile has a dedicated profile folder to save browser data … such as cookies, user preference settings, and cached resources". Se crea con `CoreWebView2ControllerOptions.ProfileName` (e `IsInPrivateModeEnabled`). Los perfiles comparten **un** proceso de navegador bajo una sola carpeta de datos **[DOC]** (https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/multi-profile-support).
- Usar varias carpetas de datos (UDF) cuesta un proceso de navegador cada una ("avoid running a WebView2 control with too many different UDFs at the same time"), y Microsoft recomienda perfiles en su lugar **[DOC]** (https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder).

**b)** `ExecuteScriptAsync` devuelve JSON **[DOC]** (referencia de CoreWebView2; también lo usa gree en `WebViewPlugin.cpp:883`).

**c, d)** `CoreWebView2.CallDevToolsProtocolMethodAsync(string methodName, string parametersAsJson)`, que "Runs an asynchronous DevToolsProtocol method" **[DOC]** (https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.calldevtoolsprotocolmethodasync).

- Con `"Input.insertText"` y `"Input.dispatchKeyEvent"` es el mismo camino que usa Electron, así que `isTrusted=true` **[INF fuerte]**.
- Microsoft advierte que las llamadas CDP "may be processed out of order", así que hay que esperar (`await`) cada una **[DOC]**.

**El punto débil: el render dentro de Unity**

- WebView2 no tiene render fuera de pantalla. El pedido "WebView2 Windowless Operation / DirectX Integration" (#20, de 2019) sigue **abierto** **[DOC]** (https://github.com/MicrosoftEdge/WebView2Feedback/issues/20).
- Opciones:
  - ventana hija (HWND) sobre la ventana de Unity: nativa, rápida, pero la UI de Unity no puede dibujarse encima **[INF]**;
  - captura a textura, como gree, que es pesada **[DOC: código]**.

**El "WebView2 para Unity" de Microsoft.** Es el Mixed Reality WebView plugin: "only supported on HoloLens 2 devices", con soporte "discontinued (no bug fixes, content updates or technical support)" **[DOC]** (https://learn.microsoft.com/en-us/windows/mixed-reality/develop/advanced-concepts/webview2-unity-plugin). **No sirve** para Windows de escritorio.

### 2.8 CEF directo

- **Plataformas.** "Building from source code is currently supported on Windows, macOS and Linux platforms". **No hay Android.** Rama estable 154 **[DOC]** (https://chromiumembedded.github.io/cef/branches_and_building). Licencia BSD **[DOC]** (https://github.com/chromiumembedded/cef).
- **a)** `CefRequestContextSettings.cache_path` es "The directory where cache data for this request context will be stored on disk… must be … a child directory of CefSettings.root_cache_path". Si queda vacío es incógnito, y "localStorage will only persist across sessions if a cache path is specified" **[DOC]** (https://raw.githubusercontent.com/chromiumembedded/cef/master/include/internal/cef_types.h). Se obtienen 9 contextos aislados en **un** proceso de navegador **[DOC/INF]**.
- **c, d)** `CefBrowserHost::SendKeyEvent` ("Send a key event to the browser"), `ImeCommitText` y `SendDevToolsMessage`. Este último no requiere "an active DevTools front-end or remote-debugging session" **[DOC]** (https://raw.githubusercontent.com/chromiumembedded/cef/master/include/cef_browser.h).
- **Visibilidad (render fuera de pantalla).** `WasHidden(true)` hace que "Layouting and CefRenderHandler::OnPaint notification will stop" **[DOC]** (mismo header).
- **Costo.** Integrar CEF en Unity a mano es justo lo que hacen Vuplex y UWB: render a textura, procesos auxiliares y empaquetado de unos 250–360 MB (dato de Vuplex) **[DOC]** (https://store.vuplex.com/webview/windows-mac). Es el camino más caro de construir.

### 2.9 Alternativa de arquitectura (solo la señalo, no la decido)

Unity como interfaz, y el navegador **fuera de proceso**: por ejemplo, el motor de Electron/Chromium que ya funciona, controlado por IPC o WebSocket local.

- En Windows reutiliza todo lo ya medido (particiones, `sendInputEvent`).
- En Android no existe Electron, así que el lado Android igual necesita el plugin WebView de 2.6.

---

## 3. Riesgos

1. **Login de Google (Gemini): el riesgo más alto, en las dos plataformas.**
   - Google anunció en 2019: "we will be blocking sign-ins from embedded browser frameworks starting in June", con CEF como ejemplo, y recomendó "browser-based OAuth authentication" **[DOC]** (https://security.googleblog.com/2019/04/better-protection-against-man-in-middle.html).
   - La ayuda oficial enumera las causas de "This browser or app may not be secure". Entre ellas están los navegadores "embedded in a different application" y los "controlled through software automation rather than a human" **[DOC]** (https://support.google.com/accounts/answer/7675428?hl=en).
   - Para OAuth de terceros en Android WebView/WKWebView, el bloqueo rige desde el 30-sep-2021 con el error `disallowed_useragent` **[DOC]** (https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/). Ese texto trata de OAuth de terceros, no del login en las propias webs de Google **[DOC]**.
   - **Aplica a CEF, a Vuplex (CEF), a UWB (CEF) y a Android WebView** **[DOC/INF]**. A WebView2 no lo nombra ninguna fuente que encontré **[PRUEBA]**.
   - Tu ChatCouncil de Electron ya usaba gemini (sus selectores están en `specs.json`). Eso sugiere que la detección no es absoluta en escritorio, pero **no lo verifiqué** **[INF]**.
   - Si en Android falla, **no hay atajo limpio**: Custom Tabs sí permite el login, pero no da acceso al DOM.
2. **Cloudflare y detección de bots.**
   - Turnstile funciona en WebView si JavaScript y el DOM storage están activos, y advierte: "Changing the User Agent during a session causes Turnstile challenges to fail" **[DOC]** (https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/).
   - Consecuencias: no cambies el User-Agent por sesión. Una CDP conectada puede ser detectable **[INF]**. Hay que probar los 9 sitios **[PRUEBA]**.
3. **Nueve vistas a la vez en Android: memoria.**
   - El único número documentado es de Vuplex ("usually … 10 active webviews … without performance issues"), del fabricante y sin medición propia **[DOC]**.
   - Hay que medir el PSS con 9 perfiles logueados en el teléfono real **[PRUEBA]**.
   - Se suma el costo de Unity mismo **[INF]**.
4. **Paneles ocultos (visibilidad).**
   - Chromium limita los temporizadores de páginas ocultas a una vez por segundo, y tras más de 5 minutos ocultas (con cadena ≥ 5, silencio ≥ 30 s y sin WebRTC) a una vez **por minuto** **[DOC]** (https://developer.chrome.com/blog/timer-throttling-in-chrome-88).
   - En WebView2, con `IsVisible=false` "the WebView is transparent and is not rendered" y "Chromium has code that throttles activities on the page" **[DOC]** (https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2controller.isvisible).
   - En CEF fuera de pantalla, `WasHidden` detiene el layout y el paint **[DOC]**.
   - Es el mismo problema que ya resolviste en Electron. Hay que reimplementar "mantener al frente": no ocultar, sino reducir o solapar las vistas, y medir si las respuestas en streaming se completan **[PRUEBA]**.
5. **Render dentro de Unity.**
   - WebView2 no tiene render fuera de pantalla (issue #20 abierto). Te quedan la ventana nativa superpuesta o la captura pesada **[DOC]**.
   - En Android el WebView puede ir como vista nativa encima de Unity, que es lo que hacen el "Native 2D Mode" de Vuplex y gree **[INF]**.
6. **Fragmentación del WebView en Android.** `MULTI_PROFILE` depende del WebView instalado y actualizado por Play. Si un dispositivo no lo soporta, la app debe decirlo y no fingir aislamiento **[DOC/INF]**.

---

## 4. Recomendación

**Recomendación: sí con condiciones. No hay un paquete único que lo resuelva.** El camino de menos código que cubre las cuatro capacidades es **un plugin nativo delgado por plataforma**, expuesto a C# con la misma interfaz mínima (`Cargar`, `EvaluarJS→string`, `InsertarTexto`, `Tecla`, `Pegar`, `Mostrar/Ocultar`):

- **Windows: WebView2** con perfiles (`ProfileName` por proveedor), `ExecuteScriptAsync` y CDP `Input.insertText` / `Input.dispatchKeyEvent`. Se muestra como ventana nativa sobre la de Unity. Puedes usar el backend Zlib de gree como referencia.
- **Android: android.webkit.WebView + androidx.webkit ≥ 1.9** con `ProfileStore` / `setProfile`, `evaluateJavascript` y `dispatchKeyEvent` / `commitText`, como vista nativa superpuesta.

**Por qué no Vuplex, aunque sea lo más rápido de integrar.** En Windows no documenta aislamiento por instancia (una sola `CachePath`), y en Android no expone perfiles ni CDP. Lo que falta habría que resolverlo igual con código nativo, y encima pagando por dos paquetes.

**Por qué no UWB ni CEF.** No existen para Android.

**Es una decisión de arquitectura: tú decides.** Antes de construir hay dos puntos que pueden tumbarla:

- (1) que Gemini permita el login dentro del WebView en cada plataforma;
- (2) que en Android la entrada llegue con `isTrusted=true` y conserve los saltos de línea en kimi.

Si (1) falla, la opción es aceptar Gemini sin login embebido en esa plataforma o repensar. No hay un rodeo legítimo.

### Pruebas mínimas que debes medir

Para la entrada usa una página local de prueba con un `<textarea>`, un `contenteditable`, ProseMirror y Lexical. Debe registrar `isTrusted`, `inputType`, `key` y el texto final en `keydown`, `beforeinput`, `input` y `paste`.

**Windows (WebView2, prototipo de consola o WinForms, sin Unity todavía)**

- **W1. Aislamiento y persistencia.** 9 controles con `ProfileName` distintos. Inicia sesión en 2 proveedores, cierra y reabre: ¿siguen logueados? En otro perfil, ¿ese sitio aparece sin sesión?
- **W2. `isTrusted`.** Con `Input.insertText` y con `Input.dispatchKeyEvent` sobre la página de prueba, ¿todo llega con `isTrusted=true`? Después, en los compositores reales de claude (ProseMirror) y kimi: ¿aparece el texto y se habilita el botón de enviar?
- **W3. Saltos de línea.** Texto de 3 párrafos en kimi con:
  - (a) `insertText` con `\n`;
  - (b) Shift+Enter por `dispatchKeyEvent` entre líneas;
  - (c) portapapeles + `dispatchKeyEvent` con `commands:["paste"]`;
  - (d) Ctrl+V.

  ¿Cuál conserva los párrafos? ¿El evento `paste` llega con `isTrusted=true`?
- **W4. Visibilidad.** Lanza una pregunta en los 9 y deja 8 tapados o minimizados durante 6 minutos. ¿Qué dice `document.visibilityState` en cada uno? ¿Terminan las respuestas?
- **W5. Google.** Inicia sesión en gemini.google.com dentro de WebView2: ¿pasa o sale "This browser or app may not be secure"?
- **W6. Memoria.** Con 9 perfiles logueados, anota la memoria total del árbol de procesos de WebView2 (Administrador de tareas).

**Android (app Android mínima, sin Unity todavía, en tu teléfono)**

- **A1.** `WebViewFeature.isFeatureSupported(MULTI_PROFILE)` y la versión del WebView instalado.
- **A2.** Lo mismo que W1, con `setProfile` por proveedor.
- **A3.** `isTrusted` con `dispatchKeyEvent` (con el WebView enfocado) y con `InputConnection.commitText`, en la página de prueba y en claude y kimi reales.
- **A4.** Lo mismo que W3, pegando con portapapeles + `KEYCODE_PASTE` o Ctrl+V.
- **A5.** Lo mismo que W5: login en Gemini dentro del WebView.
- **A6.** Con 9 WebViews logueados, ejecuta `adb shell dumpsys meminfo <paquete>` (PSS total) y anota si Android mata el renderer (`onRenderProcessGone`).
- **A7.** Lo mismo que W4.

**Ambas plataformas**

- **C1.** Abre los 9 sitios recién instalados y anota cuáles muestran un desafío de Cloudflare o de bot, y si se puede superar a mano.

**Criterio para seguir.** Avanzar si W1–W3, W5, A1–A5 y C1 pasan. W4/A7 y W6/A6 definen el diseño (cuántas vistas vivas y cómo se muestran), no si el proyecto es viable.

---

## 5. Fuentes

- DOM Standard, `isTrusted`: https://dom.spec.whatwg.org/#dom-event-istrusted
- CDP, dominio Input (pdl): https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Input.pdl
- Vuplex IWebView: https://developer.vuplex.com/webview/IWebView
- Vuplex Web: https://developer.vuplex.com/webview/Web
- Vuplex StandaloneWebView: https://developer.vuplex.com/webview/StandaloneWebView
- Vuplex AndroidWebView: https://developer.vuplex.com/webview/AndroidWebView
- Vuplex AndroidGeckoWebView: https://developer.vuplex.com/webview/AndroidGeckoWebView
- Vuplex IWithKeyDownAndUp: https://developer.vuplex.com/webview/IWithKeyDownAndUp
- Vuplex ICookieManager: https://developer.vuplex.com/webview/ICookieManager
- Vuplex, varias webviews: https://support.vuplex.com/articles/multiple-webviews/
- Vuplex, varias instancias de la app y CachePath: https://support.vuplex.com/articles/multiple-app-instances/
- Vuplex, tienda: https://store.vuplex.com/ · https://store.vuplex.com/webview/windows-mac · https://store.vuplex.com/webview/android
- Vuplex v4.14 (anuncio): https://bsky.app/profile/vuplex.com/post/3m76ksqjkws26
- UWB: https://github.com/Voltstro-Studios/UnityWebBrowser (código revisado: `WebBrowserClient.cs`, `CefEngineControlsManager.cs`, `UwbCefClient.cs`)
- ZFBrowser: https://assetstore.unity.com/packages/tools/gui/embedded-browser-55459
- gree/unity-webview: https://github.com/gree/unity-webview (código revisado: `plugins/Windows/WebViewPlugin.cpp`, `plugins/WebViewObject.cs`, `plugins/Android/.../CWebViewPlugin.java`)
- UniWebView: https://docs.uniwebview.com/guide/installation.html
- androidx.webkit, releases: https://developer.android.com/jetpack/androidx/releases/webkit
- ProfileStore: https://developer.android.com/reference/androidx/webkit/ProfileStore
- WebViewCompat: https://developer.android.com/reference/androidx/webkit/WebViewCompat
- WebViewFeature: https://developer.android.com/reference/androidx/webkit/WebViewFeature
- android.webkit.WebView: https://developer.android.com/reference/android/webkit/WebView
- Chromium, ImeAdapterImpl: https://raw.githubusercontent.com/chromium/chromium/main/content/public/android/java/src/org/chromium/content/browser/input/ImeAdapterImpl.java
- Chromium, KeyboardEventManager: https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/input/keyboard_event_manager.cc
- Chromium, arquitectura de WebView: https://raw.githubusercontent.com/chromium/chromium/main/android_webview/docs/architecture.md
- WebView2, varios perfiles: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/multi-profile-support
- WebView2, carpetas de datos: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder
- WebView2, CallDevToolsProtocolMethodAsync: https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.calldevtoolsprotocolmethodasync
- WebView2, IsVisible: https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2controller.isvisible
- WebView2, render fuera de pantalla (#20): https://github.com/MicrosoftEdge/WebView2Feedback/issues/20
- Mixed Reality WebView plugin: https://learn.microsoft.com/en-us/windows/mixed-reality/develop/advanced-concepts/webview2-unity-plugin
- CEF: https://github.com/chromiumembedded/cef · https://chromiumembedded.github.io/cef/branches_and_building
- CEF, `cef_types.h` (cache_path): https://raw.githubusercontent.com/chromiumembedded/cef/master/include/internal/cef_types.h
- CEF, `cef_browser.h` (SendKeyEvent, SendDevToolsMessage, WasHidden): https://raw.githubusercontent.com/chromiumembedded/cef/master/include/cef_browser.h
- Google Security Blog 2019 (frameworks embebidos): https://security.googleblog.com/2019/04/better-protection-against-man-in-middle.html
- Google Developers Blog 2021 (OAuth en webviews): https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/
- Ayuda de Google, "This browser or app may not be secure": https://support.google.com/accounts/answer/7675428?hl=en
- Chrome 88, limitación de temporizadores: https://developer.chrome.com/blog/timer-throttling-in-chrome-88
- Cloudflare Turnstile en móviles: https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/

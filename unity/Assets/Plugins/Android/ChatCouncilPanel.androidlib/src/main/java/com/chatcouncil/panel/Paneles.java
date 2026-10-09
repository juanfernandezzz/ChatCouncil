package com.chatcouncil.panel;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.print.ImpresionPdf;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.Profile;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

/**
 * Los paneles de los proveedores sobre android.webkit.WebView y androidx.webkit (spec, "El panel").
 * Las mismas funciones que el plugin de Windows (panel/windows/panel.cpp), por pedido y sondeo: C# llama desde el hilo de
 * Unity; lo que toca una vista pasa al hilo de la interfaz, y los resultados quedan guardados por ticket hasta que C# los lee.
 * No lee cookies, tokens ni almacenamiento, y no cambia el user agent.
 */
public final class Paneles {
    // La misma regex que Windows y Electron: toda navegación a un cierre de sesión se cancela.
    static final Pattern CIERRE = Pattern.compile("/(logout|log-out|signout|sign-out)(\\b|/|\\?|$)", Pattern.CASE_INSENSITIVE);

    static final class Panel {
        final int id;
        final String perfil;
        WebView vista;
        final AtomicInteger navegaciones = new AtomicInteger(), bloqueadas = new AtomicInteger(), terminadas = new AtomicInteger(), adjuntos = new AtomicInteger();
        volatile int emergente;
        volatile String ultimaBloqueada = "";
        volatile int x, y, ancho, alto;
        volatile File adjunto;
        // Cada iframe de un origen permitido que avisó que existe: {origen, canal}. Solo se tocan en el hilo de la interfaz.
        final ArrayList<Object[]> iframes = new ArrayList<>();

        Panel(int id, String perfil) { this.id = id; this.perfil = perfil; }
    }

    static Activity actividad;
    static Handler ui;
    static FrameLayout capa;
    static final Set<String> hosts = new HashSet<>();
    static String carpetaAssets = "";
    static Set<String> origenesIframe = new HashSet<>();
    static String scriptIframe = "";
    static volatile int entorno;
    static volatile String error = "";
    static final AtomicInteger siguienteId = new AtomicInteger(), siguienteTicket = new AtomicInteger();
    static final ConcurrentHashMap<Integer, Panel> paneles = new ConcurrentHashMap<>();
    static final ConcurrentHashMap<Integer, String> resultados = new ConcurrentHashMap<>();
    static final Set<Integer> pendientes = ConcurrentHashMap.newKeySet();

    public static int fallar(String mensaje) {
        error = mensaje;
        return -1;
    }

    /** Corre en el hilo de la interfaz y espera el resultado: lo que en Windows es una llamada sincrónica. */
    static <T> T enUi(Callable<T> c) throws Exception {
        if (Looper.myLooper() == Looper.getMainLooper()) return c.call();
        FutureTask<T> t = new FutureTask<>(c);
        ui.post(t);
        return t.get(10, TimeUnit.SECONDS);
    }

    static Panel buscar(int id) { return paneles.get(id); }

    /**
     * hosts (separados por ';') sirven la carpeta de StreamingAssets carpetaHost en https://host/. El script de iframe se
     * registra en cada panel como script de inicio de documento, restringido a origenes (separados por ';').
     */
    public static int iniciar(Activity a, String listaHosts, String carpetaHost, String origenes, String script) {
        try {
            actividad = a;
            ui = new Handler(Looper.getMainLooper());
            hosts.clear();
            for (String h : listaHosts.split(";")) if (!h.isEmpty()) hosts.add(h);
            // En Android, StreamingAssets es "jar:file://…/base.apk!/assets/…": se sirve desde el AssetManager.
            int i = carpetaHost.indexOf("!/assets/");
            carpetaAssets = i < 0 ? "" : carpetaHost.substring(i + "!/assets/".length()) + "/";
            origenesIframe = new HashSet<>();
            for (String o : origenes.split(";")) if (!o.isEmpty()) origenesIframe.add(o);
            scriptIframe = script;
            return enUi(() -> {
                // Sin perfiles separados, las sesiones de los proveedores se mezclarían: la app lo dice y no abre paneles.
                if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))
                    return fallar("este teléfono no admite perfiles separados (MULTI_PROFILE). Actualiza \"Android System WebView\" desde Google Play y vuelve a abrir la app.");
                if (capa == null) {
                    capa = new FrameLayout(a);
                    a.addContentView(capa, new ViewGroup.LayoutParams(-1, -1));
                }
                entorno = 1;
                return 0;
            });
        } catch (Exception e) {
            return fallar("no se pudo iniciar: " + e);
        }
    }

    public static int estadoEntorno() { return entorno; }

    public static int crear(String perfil, String url) {
        try {
            return enUi(() -> {
                Panel p = nuevo(perfil);
                capa.addView(p.vista, new FrameLayout.LayoutParams(-1, -1));
                cargar(p, url);
                return p.id;
            });
        } catch (Exception e) {
            return fallar("no se pudo crear el panel " + perfil + ": " + e);
        }
    }

    static Panel nuevo(String perfil) {
        Panel p = new Panel(siguienteId.incrementAndGet(), perfil);
        WebView w = new WebView(actividad);
        // El perfil se fija ANTES de cualquier otra cosa (si no, setProfile lanza IllegalStateException).
        WebViewCompat.setProfile(w, perfil);
        p.vista = w;
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // Sin esto, window.open no hace nada (medido en la prueba de login, 2026-10-05).
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        ProfileStore.getInstance().getOrCreateProfile(perfil).getCookieManager().setAcceptThirdPartyCookies(w, true);
        w.setBackgroundColor(Color.WHITE);
        w.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> { p.x = l; p.y = t; p.ancho = r - l; p.alto = b - t; });

        if (!origenesIframe.isEmpty() && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
                && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addWebMessageListener(w, "ccIframe", origenesIframe, (vista, mensaje, origen, principal, canal) -> alMensaje(p, mensaje, origen, principal, canal));
            WebViewCompat.addDocumentStartJavaScript(w, scriptIframe, origenesIframe);
        }

        w.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (!r.isForMainFrame() || !CIERRE.matcher(r.getUrl().toString()).find()) return false;
                p.bloqueadas.incrementAndGet();
                p.ultimaBloqueada = r.getUrl().toString();
                return true;
            }

            @Override
            public void onPageStarted(WebView v, String url, android.graphics.Bitmap icono) { p.navegaciones.incrementAndGet(); }

            @Override
            public void onPageFinished(WebView v, String url) { p.terminadas.incrementAndGet(); }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!"https".equals(u.getScheme()) || !hosts.contains(u.getHost())) return null;
                String ruta = u.getPath() == null || u.getPath().equals("/") ? "index.html" : u.getPath().substring(1);
                try {
                    InputStream in = actividad.getAssets().open(carpetaAssets + ruta);
                    String tipo = URLConnection.guessContentTypeFromName(ruta);
                    if (ruta.endsWith(".js")) tipo = "text/javascript";
                    return new WebResourceResponse(tipo == null ? "application/octet-stream" : tipo, "utf-8", in);
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
                }
            }
        });
        w.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView v, boolean dialogo, boolean gesto, Message msg) {
                // Vista nueva con el MISMO perfil, encima, entregada por WebViewTransport para que window.opener siga conectado.
                Panel e = nuevo(p.perfil);
                capa.addView(e.vista, new FrameLayout.LayoutParams(-1, -1));
                ((WebView.WebViewTransport) msg.obj).setWebView(e.vista);
                msg.sendToTarget();
                p.emergente = e.id;
                return true;
            }

            @Override
            public void onCloseWindow(WebView v) { quitar(p); }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> elegidos, FileChooserParams params) {
                // El selector del sistema devuelve directamente el archivo que la app preparó, sin mostrarse.
                File f = p.adjunto;
                if (f == null) return false;
                p.adjunto = null;
                elegidos.onReceiveValue(new Uri[] { Uri.fromFile(f) });
                p.adjuntos.incrementAndGet();
                return true;
            }
        });
        paneles.put(p.id, p);
        return p;
    }

    /** loadUrl no pasa por shouldOverrideUrlLoading: el bloqueo se aplica aquí también. */
    static void cargar(Panel p, String url) {
        if (CIERRE.matcher(url).find()) {
            p.bloqueadas.incrementAndGet();
            p.ultimaBloqueada = url;
            p.terminadas.incrementAndGet(); // como WebView2, que da por terminada la cancelada: C# ve el bloqueo al terminar
            return;
        }
        p.vista.loadUrl(url);
    }

    /** Un iframe avisa "hola" al cargar; después responde "ticket:json" a cada lectura. */
    static void alMensaje(Panel p, WebMessageCompat mensaje, Uri origen, boolean principal, JavaScriptReplyProxy canal) {
        String datos = mensaje.getData();
        if (datos == null || principal) return;
        if (datos.equals("hola")) {
            p.iframes.add(new Object[] { origen.toString(), canal });
            return;
        }
        int i = datos.indexOf(':');
        if (i < 0) return;
        try {
            int ticket = Integer.parseInt(datos.substring(0, i));
            // Como ExecuteScript de un JSON.stringify en Windows: el JSON queda como un string de JSON.
            if (pendientes.remove(ticket)) resultados.put(ticket, JSONObject.quote(datos.substring(i + 1)));
        } catch (NumberFormatException ignorado) {
        }
    }

    /** 1 abierto; -1 si no existe o se cerró. */
    public static int estadoPanel(int id) { return buscar(id) == null ? -1 : 1; }

    public static void rect(int id, int x, int y, int ancho, int alto) {
        Panel p = buscar(id);
        if (p == null) return;
        try {
            enUi(() -> {
                FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ancho, alto);
                lp.leftMargin = x;
                lp.topMargin = y;
                p.vista.setLayoutParams(lp);
                return null;
            });
        } catch (Exception e) {
            fallar("no se pudo posicionar el panel: " + e);
        }
    }

    /** Los paneles se apilan visibles en la capa (spec): el activo pasa arriba, sin ocultar a los demás. */
    public static void frente(int id) {
        Panel p = buscar(id);
        if (p == null) return;
        try {
            enUi(() -> { p.vista.bringToFront(); capa.invalidate(); return null; });
        } catch (Exception e) {
            fallar("no se pudo traer el panel al frente: " + e);
        }
    }

    public static void atras(int id) {
        Panel p = buscar(id);
        if (p == null) return;
        try {
            enUi(() -> {
                ViewGroup.LayoutParams lp = p.vista.getLayoutParams();
                capa.removeView(p.vista);
                capa.addView(p.vista, 0, lp);
                return null;
            });
        } catch (Exception e) {
            fallar("no se pudo mandar el panel atrás: " + e);
        }
    }

    public static int esFrente(int id) {
        Panel p = buscar(id);
        if (p == null) return 0;
        try {
            return enUi(() -> capa.getChildAt(capa.getChildCount() - 1) == p.vista ? 1 : 0);
        } catch (Exception e) {
            return 0;
        }
    }

    public static int[] rectReal(int id) {
        Panel p = buscar(id);
        return p == null ? new int[4] : new int[] { p.x, p.y, p.ancho, p.alto };
    }

    public static int navegar(int id, String url) {
        Panel p = buscar(id);
        if (p == null) return fallar("el panel no existe");
        ui.post(() -> cargar(p, url));
        return 0;
    }

    /** 0: navegaciones que empezaron; 1: bloqueadas; 2: terminadas; 3: última emergente; 4: archivos entregados al selector. */
    public static int contador(int id, int cual) {
        Panel p = buscar(id);
        if (p == null) return -1;
        switch (cual) {
            case 0: return p.navegaciones.get();
            case 1: return p.bloqueadas.get();
            case 2: return p.terminadas.get();
            case 3: return p.emergente;
            case 4: return p.adjuntos.get();
            default: return -1;
        }
    }

    static int nuevoTicket() {
        int t = siguienteTicket.incrementAndGet();
        pendientes.add(t);
        return t;
    }

    static void guardar(int ticket, String r) {
        if (pendientes.remove(ticket)) resultados.put(ticket, r);
    }

    /** evaluateJavascript devuelve el resultado como JSON, igual que ExecuteScript. Un script que lanza devuelve "null". */
    public static int ejecutar(int id, String script) {
        Panel p = buscar(id);
        if (p == null) return fallar("el panel no existe");
        int t = nuevoTicket();
        ui.post(() -> p.vista.evaluateJavascript(script, r -> guardar(t, r == null ? "null" : r)));
        return t;
    }

    /** Lee en el último iframe que avisó y cuyo origen contiene urlContiene. -1 si no hay ninguno. */
    public static int ejecutarEnIframe(int id, String urlContiene, String selector) {
        Panel p = buscar(id);
        if (p == null) return fallar("el panel no existe");
        try {
            JavaScriptReplyProxy canal = enUi(() -> {
                for (int i = p.iframes.size() - 1; i >= 0; i--)
                    if (((String) p.iframes.get(i)[0]).contains(urlContiene)) return (JavaScriptReplyProxy) p.iframes.get(i)[1];
                return null;
            });
            if (canal == null) return fallar("no hay un iframe con " + urlContiene);
            int t = nuevoTicket();
            ui.post(() -> canal.postMessage(t + ":" + selector));
            return t;
        } catch (Exception e) {
            return fallar("no se pudo leer el iframe: " + e);
        }
    }

    /** La impresión del sistema (PrintDocumentAdapter del WebView) a un archivo, sin diálogo. "true" o "false". */
    public static int pdf(int id, String ruta) {
        Panel p = buscar(id);
        if (p == null) return fallar("el panel no existe");
        int t = nuevoTicket();
        ui.post(() -> {
            try {
                ImpresionPdf.imprimir(p.vista.createPrintDocumentAdapter("ChatCouncil"), new File(ruta), ok -> guardar(t, ok ? "true" : "false"));
            } catch (Throwable e) {
                guardar(t, "{\"__error\":" + JSONObject.quote(e.toString()) + "}");
            }
        });
        return t;
    }

    /** Borra cookies, almacenamiento y caché del perfil del panel. */
    public static int borrar(int id) {
        Panel p = buscar(id);
        if (p == null) return fallar("el panel no existe");
        int t = nuevoTicket();
        ui.post(() -> {
            Profile perfil = ProfileStore.getInstance().getProfile(p.perfil);
            perfil.getWebStorage().deleteAllData();
            p.vista.clearCache(true);
            perfil.getCookieManager().removeAllCookies(ok -> guardar(t, "true"));
        });
        return t;
    }

    public static int prepararAdjunto(int id, String ruta) {
        Panel p = buscar(id);
        if (p == null) return fallar("el panel no existe");
        File f = new File(ruta);
        if (!f.isFile()) return fallar("no existe el archivo " + ruta);
        p.adjunto = f;
        return 0;
    }

    /**
     * Un toque en (x, y), en píxeles de la vista. El selector de archivos solo se abre con activación del usuario:
     * un click() desde un script no lo abre (medido en T17), un toque que entra por la vista sí.
     */
    public static int tocar(int id, int x, int y) {
        Panel p = buscar(id);
        if (p == null) return fallar("el panel no existe");
        try {
            return enUi(() -> {
                long t = SystemClock.uptimeMillis();
                for (int accion : new int[] { MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP }) {
                    MotionEvent e = MotionEvent.obtain(t, SystemClock.uptimeMillis(), accion, x, y, 0);
                    e.setSource(InputDevice.SOURCE_TOUCHSCREEN);
                    p.vista.dispatchTouchEvent(e);
                    e.recycle();
                }
                return 0;
            });
        } catch (Exception e) {
            return fallar("no se pudo tocar el panel: " + e);
        }
    }

    public static void olvidar(int ticket) {
        pendientes.remove(ticket);
        resultados.remove(ticket);
    }

    /** null si sigue pendiente; el resultado se olvida al leerlo. */
    public static String resultado(int ticket) {
        String r = resultados.remove(ticket);
        if (r != null) return r;
        if (pendientes.contains(ticket)) return null;
        throw new IllegalStateException("Resultado de script desconocido: " + ticket);
    }

    /** 1: versión del WebView; 2: línea de comandos (no existe en Android); 3: perfil según el WebView; 4: última bloqueada; 5: error. */
    public static String texto(int cual, int id) {
        try {
            switch (cual) {
                case 1: return enUi(() -> { android.content.pm.PackageInfo i = WebViewCompat.getCurrentWebViewPackage(actividad); return i == null ? "" : i.packageName + " " + i.versionName; });
                case 3: { Panel p = buscar(id); return p == null ? "" : enUi(() -> WebViewCompat.getProfile(p.vista).getName()); }
                case 4: { Panel p = buscar(id); return p == null ? "" : p.ultimaBloqueada; }
                case 5: return error;
                default: return "";
            }
        } catch (Exception e) {
            return "";
        }
    }

    public static void cerrar(int id) {
        Panel p = buscar(id);
        if (p == null) return;
        try {
            enUi(() -> { quitar(p); return null; });
        } catch (Exception e) {
            fallar("no se pudo cerrar el panel: " + e);
        }
    }

    static void quitar(Panel p) {
        if (paneles.remove(p.id) == null) return;
        capa.removeView(p.vista);
        p.vista.destroy();
    }

    /** Un archivo de StreamingAssets, que en Android está dentro del .apk. */
    public static String asset(String nombre) throws Exception {
        try (InputStream in = actividad.getAssets().open(nombre)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
            return new String(b.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}

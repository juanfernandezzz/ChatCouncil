package com.chatcouncil.pruebalogin;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.webkit.ProfileStore;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.ArrayList;

// Prueba de login de Google en Android System WebView. Sin captura, sin pegar, sin cambiar el user agent.
public class MainActivity extends Activity {
    // Orden y URLs de packages/providers/src/specs.json (newConversationUrl).
    static final String[][] PROVEEDORES = {
        {"ChatGPT", "https://chatgpt.com/"},
        {"Gemini", "https://gemini.google.com/app"},
        {"Claude", "https://claude.ai/new"},
        {"Grok", "https://grok.com/"},
        {"Mistral", "https://chat.mistral.ai/"},
        {"GLM", "https://chat.z.ai/"},
        {"Kimi", "https://kimi.ai/"},
        {"Qwen", "https://chat.qwen.ai/"},
        {"DeepSeek", "https://chat.deepseek.com/sign_in"},
    };
    static final ViewGroup.LayoutParams LLENO = new ViewGroup.LayoutParams(-1, -1);

    FrameLayout paneles;
    final WebView[] vistas = new WebView[PROVEEDORES.length];
    final ArrayList<WebView> emergentes = new ArrayList<>(); // el tag de cada una es el índice de su proveedor
    int actual;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            TextView t = new TextView(this);
            t.setPadding(48, 48, 48, 48);
            t.setTextSize(18);
            t.setText("Este teléfono no admite perfiles separados. Actualiza \"Android System WebView\" desde Google Play y vuelve a abrir la app.");
            setContentView(t);
            return;
        }
        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setFitsSystemWindows(true);
        LinearLayout botones = new LinearLayout(this);
        for (int i = 0; i < PROVEEDORES.length; i++) {
            final int k = i;
            Button btn = new Button(this);
            btn.setText(PROVEEDORES[i][0]);
            btn.setAllCaps(false);
            btn.setOnClickListener(v -> mostrar(k));
            botones.addView(btn);
        }
        HorizontalScrollView barra = new HorizontalScrollView(this);
        barra.addView(botones);
        raiz.addView(barra);
        paneles = new FrameLayout(this);
        raiz.addView(paneles, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(raiz);
        mostrar(0);
    }

    void mostrar(int i) {
        actual = i;
        if (vistas[i] == null) {
            vistas[i] = nueva(i);
            paneles.addView(vistas[i], LLENO);
            vistas[i].loadUrl(PROVEEDORES[i][1]);
        }
        for (int j = 0; j < vistas.length; j++)
            if (vistas[j] != null) vistas[j].setVisibility(j == i ? View.VISIBLE : View.GONE);
        for (WebView e : emergentes)
            e.setVisibility((int) e.getTag() == i ? View.VISIBLE : View.GONE);
    }

    WebView nueva(int i) {
        String perfil = PROVEEDORES[i][0].toLowerCase();
        WebView w = new WebView(this);
        // El perfil se fija ANTES de cualquier otra cosa (si no, setProfile lanza IllegalStateException).
        WebViewCompat.setProfile(w, perfil);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // Sin esto, window.open no hace nada en Android WebView.
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        ProfileStore.getInstance().getOrCreateProfile(perfil).getCookieManager().setAcceptThirdPartyCookies(w, true);
        w.setWebViewClient(new WebViewClient()); // los enlaces quedan dentro de la app
        w.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView v, boolean dialogo, boolean gesto, Message msg) {
                // Vista nueva con el MISMO perfil, encima del panel, entregada por
                // WebViewTransport para que window.opener siga conectado.
                WebView emergente = nueva(i);
                emergente.setBackgroundColor(Color.WHITE);
                emergente.setTag(i);
                emergentes.add(emergente);
                paneles.addView(emergente, LLENO);
                ((WebView.WebViewTransport) msg.obj).setWebView(emergente);
                msg.sendToTarget();
                return true;
            }

            @Override
            public void onCloseWindow(WebView v) { cerrar(v); } // window.close() al terminar el login
        });
        return w;
    }

    void cerrar(WebView v) {
        emergentes.remove(v);
        paneles.removeView(v);
        v.destroy();
    }

    @Override
    public void onBackPressed() {
        for (int j = emergentes.size() - 1; j >= 0; j--)
            if ((int) emergentes.get(j).getTag() == actual) { cerrar(emergentes.get(j)); return; }
        if (vistas[actual] != null && vistas[actual].canGoBack()) vistas[actual].goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Guarda las cookies en disco para que la sesión siga al reabrir.
        if (paneles != null)
            for (String nombre : ProfileStore.getInstance().getAllProfileNames())
                ProfileStore.getInstance().getProfile(nombre).getCookieManager().flush();
    }
}

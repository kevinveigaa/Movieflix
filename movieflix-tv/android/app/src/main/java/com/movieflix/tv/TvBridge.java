package com.movieflix.tv;

import android.net.Uri;
import android.webkit.JavascriptInterface;

/**
 * MovieFlix TV — ponte nativa JavaScript ↔ app.
 *
 * O site (WebView) consulta caminhos de ponte nativa que já existem no
 * MovieFlix Mobile. Este objeto implementa os MESMOS nomes/métodos para que o
 * site funcione sem alterações no app TV:
 *
 *  - MovieFlixAndroid.exitApp()  → fecha o app (duplo-back confirmado).
 *  - MovieFlixAndroid.isApp()    → confirma que roda dentro do app nativo.
 *  - MovieFlixTV.abrirWhatsApp(url) / MovieFlixAndroid.abrirWhatsApp(url)
 *    → abre o WhatsApp OFICIAL via intent (contorna o bloqueio de window.open
 *      dentro do WebView). Só aceita o WhatsApp oficial do MovieFlix.
 */
public class TvBridge {

    private final MainActivity activity;

    public TvBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void exitApp() {
        activity.runOnUiThread(new Runnable() {
            @Override public void run() { activity.fecharApp(); }
        });
    }

    @JavascriptInterface
    public boolean isApp() { return true; }

    @JavascriptInterface
    public String getSiteUrl() { return MainActivity.SITE_URL; }

    @JavascriptInterface
    public void abrirWhatsApp(String url) {
        if (url == null || url.isEmpty()) return;
        Uri uri;
        try { uri = Uri.parse(url); } catch (Exception e) { return; }
        if (!MainActivity.ehWhatsAppOficial(uri)) return;
        final Uri destino = uri;
        activity.runOnUiThread(new Runnable() {
            @Override public void run() { activity.abrirExterno(destino); }
        });
    }
}

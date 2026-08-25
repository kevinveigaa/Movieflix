package com.movieflix.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * MovieFlixPlugin — ponte nativa entre o site (WebView) e o app.
 *
 * Expõe ao JS do site:
 *   - `MovieFlixApp.isApp()` → true quando rodando dentro do app nativo.
 *     O site usa isso para esconder o botão "Baixar app" (não faz sentido
 *     baixar o app dentro do próprio app) e para adaptar a UI (ex.: dica de
 *     controle remoto sempre visível).
 *   - `MovieFlixApp.onAdBlocked()` → notificação enviada pelo app nativo
 *     quando um anúncio/redirect foi bloqueado (o site pode logar/telemetria).
 *
 * O plugin é registrado automaticamente pelo Capacitor (BridgeActivity
 * escaneia @CapacitorPlugin).
 */
@CapacitorPlugin(name = "MovieFlixApp")
public class MovieFlixPlugin extends Plugin {

    @PluginMethod
    public void isApp(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isApp", true);
        ret.put("platform", "android");
        call.resolve(ret);
    }

    @PluginMethod
    public void getSiteUrl(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("url", MainActivity.SITE_URL);
        call.resolve(ret);
    }

    /**
     * Sai do app (duplo-back confirmado pelo site). Chamado pelo JS via
     * `MovieFlixApp.exitApp()` quando o usuário pulsa "voltar" duas vezes na
     * raiz — fecha o app de verdade (o equivalente a super.onBackPressed()
     * do Android).
     */
    @PluginMethod
    public void exitApp(PluginCall call) {
        getActivity().runOnUiThread(() -> getActivity().finishAndRemoveTask());
        call.resolve();
    }
}

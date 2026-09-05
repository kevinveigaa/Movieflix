package com.movieflix.app;

import android.content.Intent;
import android.net.Uri;

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
     * Abre o WhatsApp OFICIAL do MovieFlix no app nativo (intent ACTION_VIEW).
     *
     * Motivo: dentro do WebView do app, `window.open` é bloqueado por
     * `setSupportMultipleWindows(false)` (retorna um Window inútil, não-nulo) e
     * a navegação via `location.href` passa pela interceptação do
     * shouldOverrideUrlLoading. Para abrir o WhatsApp de forma CONFIÁVEL no app,
     * o JS chama esta ponte nativa, que valida a URL (só o WhatsApp oficial) e
     * dispara o intent diretamente — sem depender de window.open/location.href.
     *
     * Estratégia (não deixa o usuário preso no app):
     *  1. Tenta o DEEP LINK NATIVO `whatsapp://send?phone=5511943750307&text=...`
     *     (abre direto a conversa se o WhatsApp estiver instalado).
     *  2. Se não houver app que trate `whatsapp://` (ActivityNotFoundException),
     *     cai para `https://wa.me/5511943750307?text=...` (abre o WhatsApp Web
     *     no navegador se o app não estiver instalado).
     * Nunca navega o WebView para fora do site.
     *
     * Segurança: só aceita URLs do WhatsApp OFICIAL do MovieFlix (wa.me /
     * whatsapp.com com o número configurado). Qualquer outra URL é rejeitada.
     */
    @PluginMethod
    public void abrirWhatsApp(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL obrigatória");
            return;
        }
        try {
            Uri uri = Uri.parse(url);
            if (!MainActivity.ehWhatsAppOficial(uri)) {
                call.reject("URL não permitida");
                return;
            }
            // Extrai phone + text para montar o deep link nativo.
            // O `text` vem URL-encoded do JS (encodeURIComponent) — decodifica
            // para re-encodar corretamente no deep link nativo.
            String phone = uri.getQueryParameter("phone");
            String text = uri.getQueryParameter("text");
            String numero = MainActivity.WHATSAPP_NUMBER;
            if (phone != null) {
                String limpo = phone.replaceAll("\\D", "");
                if (!limpo.isEmpty()) numero = limpo;
            }
            // 1) Deep link nativo whatsapp:// (app instalado) — com número E
            //    mensagem pré-preenchida. O texto é decodificado e re-encodado
            //    para garantir que acentos/espaços/emojis cheguem corretos.
            try {
                StringBuilder sb = new StringBuilder("whatsapp://send?phone=").append(numero);
                if (text != null && !text.isEmpty()) {
                    String textoDecodificado = java.net.URLDecoder.decode(text, "UTF-8");
                    sb.append("&text=").append(Uri.encode(textoDecodificado));
                }
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(sb.toString()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(intent);
                call.resolve();
                return;
            } catch (Exception e) {
                // Sem app que trate whatsapp:// → fallback para api.whatsapp.com
                // (abre o WhatsApp Web no navegador se o app nativo não estiver
                // instalado). Usa a URL original (com phone + text).
            }
            // 2) Fallback: https://api.whatsapp.com/send?phone=...&text=...
            //    (abre no navegador/WhatsApp Web).
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("Não foi possível abrir o WhatsApp", e);
            }
        } catch (Exception e) {
            call.reject("Não foi possível abrir o WhatsApp", e);
        }
    }

    /**
     * Abre uma URL no NAVEGADOR EXTERNO do celular (fora do WebView), via
     * intent ACTION_VIEW.
     *
     * Motivo: dentro do WebView do app, `window.open` é bloqueado por
     * `setSupportMultipleWindows(false)` e a navegação via `location.href`
     * passa pela interceptação do shouldOverrideUrlLoading. Para abrir a
     * página de assinatura do site no navegador externo (onde o WhatsApp
     * funciona normalmente), o JS chama esta ponte nativa, que dispara o
     * intent ACTION_VIEW diretamente — o navegador do celular abre a URL
     * FORA do WebView, sem bloquear, sem voltar, sem prender o usuário.
     *
     * Segurança: a URL é validada pelo chamador (WhatsAppButton) antes de
     * chamar esta ponte — apenas a página de assinatura do próprio site é
     * aberta aqui.
     */
    @PluginMethod
    public void abrirNoNavegador(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL obrigatória");
            return;
        }
        try {
            Uri uri = Uri.parse(url);
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não foi possível abrir o navegador", e);
        }
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

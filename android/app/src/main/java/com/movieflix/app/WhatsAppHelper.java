package com.movieflix.app;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;

/**
 * Utilitário de WhatsApp do MovieFlix.
 *
 * Abre o WhatsApp NATIVAMENTE com o número oficial (5511943750307) e a
 * mensagem pré-preenchida, usando Intent ACTION_VIEW.
 *
 * Estratégia (garante que SEMPRE abra com número + mensagem):
 *  1. Tenta o deep link nativo `whatsapp://send?phone=...&text=...` — abre
 *     direto a conversa com número e mensagem preenchidos se o WhatsApp
 *     estiver instalado.
 *  2. Se não houver app que trate `whatsapp://` (ActivityNotFoundException),
 *     cai para `https://api.whatsapp.com/send?phone=...&text=...` — abre o
 *     WhatsApp Web no navegador (ou o app, dependendo do dispositivo) com o
 *     número e a mensagem preenchidos.
 *
 * O texto é URL-encoded (Uri.encode) para que acentos, espaços, emojis e
 * quebras de linha cheguem corretamente.
 */
public final class WhatsAppHelper {

    public static final String WHATSAPP_NUMBER = "5511943750307";

    private WhatsAppHelper() {}

    /** Abre o WhatsApp com o número oficial e a mensagem fornecida. */
    public static void abrirWhatsApp(Context context, String message) {
        abrirWhatsApp(context, WHATSAPP_NUMBER, message);
    }

    /** Abre o WhatsApp com um número e mensagem específicos. */
    public static void abrirWhatsApp(Context context, String numero, String message) {
        String numeroLimpo = numero == null ? WHATSAPP_NUMBER : numero.replaceAll("\\D", "");
        if (numeroLimpo.isEmpty()) numeroLimpo = WHATSAPP_NUMBER;

        String texto = message == null ? "" : message;
        String textoEncoded = Uri.encode(texto);

        // 1) Deep link nativo whatsapp:// — número E mensagem.
        try {
            String deepLink = "whatsapp://send?phone=" + numeroLimpo + "&text=" + textoEncoded;
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(deepLink));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            return;
        } catch (ActivityNotFoundException e) {
            // Sem app que trate whatsapp:// → fallback abaixo.
        } catch (Exception e) {
            // Qualquer outro erro → fallback abaixo.
        }

        // 2) Fallback: https://api.whatsapp.com/send?phone=...&text=...
        try {
            String url = "https://api.whatsapp.com/send?phone=" + numeroLimpo + "&text=" + textoEncoded;
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(context, "Não foi possível abrir o WhatsApp", Toast.LENGTH_SHORT).show();
        }
    }

    /** Abre uma URL externa (trailer, filme, etc.) no navegador/app externo. */
    public static void abrirLinkExterno(Context context, String url) {
        if (url == null || url.isEmpty()) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(context, "Não foi possível abrir o link", Toast.LENGTH_SHORT).show();
        }
    }
}
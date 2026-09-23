package com.movieflix.tv

import android.content.Context
import android.content.Intent
import android.net.Uri
import java.net.URLEncoder

/**
 * Ativacao de assinatura pelo WhatsApp oficial (5511943750307).
 *
 * Monta a mensagem com os dados REAIS da conta (e-mail logado + plano + valor +
 * duracao) e tenta, nesta ordem:
 *  1. deep link nativo `whatsapp://send?...` (WhatsApp instalado);
 *  2. link universal `https://wa.me/5511943750307?text=...` (WhatsApp Web/app);
 *  3. navegador externo do aparelho (wa.me).
 * Se nada abrir, devolve false para a tela mostrar o numero na tela.
 */
object WhatsAppHelper {

    fun mensagem(email: String?, planoNome: String?, valorFormatado: String?, duracaoDias: Int?): String {
        val e = email?.takeIf { it.isNotBlank() } ?: "(nao informado)"
        val p = planoNome?.takeIf { it.isNotBlank() } ?: "(a definir)"
        val v = valorFormatado?.takeIf { it.isNotBlank() } ?: "(a definir)"
        val d = if (duracaoDias != null && duracaoDias > 0) "$duracaoDias dias" else "(a definir)"
        return "Ola! Quero contratar o plano $p do MovieFlix.\n" +
            "E-mail da conta: $e\n" +
            "Plano: $p\n" +
            "Valor: $v\n" +
            "Duracao: $d\n" +
            "Por favor, me envie as instrucoes para pagamento/ativacao."
    }

    fun urlDeepLink(msg: String): String =
        "whatsapp://send?phone=${AppConfig.WHATSAPP_NUMBER}&text=" + encode(msg)

    fun urlWhatsAppWeb(msg: String): String =
        "https://wa.me/${AppConfig.WHATSAPP_NUMBER}?text=" + encode(msg)

    private fun encode(msg: String): String = URLEncoder.encode(msg, "UTF-8")

    /**
     * Abre o WhatsApp (ou o navegador) FORA do app, com a mensagem pronta.
     * @return true se algum app externo aceitou o intent.
     */
    fun abrir(ctx: Context, msg: String): Boolean {
        if (abrirUrl(ctx, urlDeepLink(msg))) return true
        if (abrirUrl(ctx, urlWhatsAppWeb(msg))) return true
        return false
    }

    private fun abrirUrl(ctx: Context, url: String): Boolean = try {
        val i = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        ctx.startActivity(i)
        true
    } catch (_: Exception) {
        false
    }
}

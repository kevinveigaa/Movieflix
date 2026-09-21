package com.movieflix.tv

/**
 * Regras de plano — cópia fiel de `src/lib/plans.ts` do app mobile.
 *
 * Nenhum valor é inventado na TV: os limites por código de plano são exatamente
 * os mesmos usados pelo site/mobile (720p/1 tela/2 perfis no simples,
 * 1080p/2 telas/3 perfis no padrão, 4K/4 telas/5 perfis no premium).
 *
 * A "fonte de verdade" da validade é a DATA DE VENCIMENTO (expires_at) —
 * nunca a contagem de dias armazenada.
 */
object PlanoRegras {

    const val UNLIMITED = Int.MAX_VALUE

    data class PlanEntitlements(
        /** Altura máxima de vídeo (px). 0 = sem reprodução. */
        val maxHeight: Int,
        val qualityLabel: String,
        /** Telas simultâneas permitidas. */
        val screens: Int,
        /** Downloads por mês (0 = não permitido, UNLIMITED = ilimitado). */
        val downloads: Int,
        /** Perfis que o assinante pode criar. */
        val maxProfiles: Int,
        /** Títulos no "Continuar assistindo". */
        val maxHistory: Int,
    )

    private val DEFAULT_BY_CODE: Map<String, PlanEntitlements> = mapOf(
        "simple" to PlanEntitlements(720, "HD (720p)", 1, 0, 2, 5),
        "basico" to PlanEntitlements(720, "HD (720p)", 1, 0, 2, 5),
        "basic" to PlanEntitlements(720, "HD (720p)", 1, 0, 2, 5),
        "standard" to PlanEntitlements(1080, "Full HD (1080p)", 2, 5, 3, 15),
        "padrao" to PlanEntitlements(1080, "Full HD (1080p)", 2, 5, 3, 15),
        "medio" to PlanEntitlements(1080, "Full HD (1080p)", 2, 5, 3, 15),
        "premium" to PlanEntitlements(2160, "4K + HDR", 4, UNLIMITED, 5, UNLIMITED),
    )

    val FREE_ENTITLEMENTS = PlanEntitlements(
        maxHeight = 0,
        qualityLabel = "Somente catálogo e trailers",
        screens = 0,
        downloads = 0,
        maxProfiles = 1,
        maxHistory = 3,
    )

    private fun normalize(v: String?): String = (v ?: "").trim().lowercase()

    /**
     * Resolve o plano de uma assinatura tolerando dados inconsistentes:
     * `plan_code` pode vir como código, como UUID ou nulo; `plan_id` pode ter o
     * UUID. Compara sempre case-insensitive (igual a `resolveSubscriptionPlan`).
     */
    fun resolvePlano(a: AccountRepository.Assinatura?, planos: List<AccountRepository.Plano>): AccountRepository.Plano? {
        if (a == null) return null
        if (planos.isEmpty()) return null
        val code = normalize(a.planCode)
        val planId = normalize(a.planId)
        return planos.firstOrNull { planId.isNotEmpty() && normalize(it.id) == planId }
            ?: planos.firstOrNull { code.isNotEmpty() && normalize(it.code) == code }
            ?: planos.firstOrNull { code.isNotEmpty() && normalize(it.id) == code }
            ?: planos.firstOrNull { planId.isNotEmpty() && normalize(it.code) == planId }
    }

    /** Entitlements de um plano — pelo código, com fallback por preço (igual ao mobile). */
    fun entitlementsForPlan(plan: AccountRepository.Plano?): PlanEntitlements {
        if (plan == null) return FREE_ENTITLEMENTS
        DEFAULT_BY_CODE[normalize(plan.code)]?.let { return it }
        // Fallback pelo preço (mesmos limiares do mobile: >= 4000 premium, >= 2500 standard)
        val price = plan.priceCents
        if (price >= 4000) return DEFAULT_BY_CODE.getValue("premium")
        if (price >= 2500) return DEFAULT_BY_CODE.getValue("standard")
        return DEFAULT_BY_CODE.getValue("basic")
    }

    /** Entitlements efetivos da assinatura (só se ativa). */
    fun entitlementsForSubscription(
        a: AccountRepository.Assinatura?,
        ativa: Boolean,
        planos: List<AccountRepository.Plano>,
    ): PlanEntitlements {
        if (!ativa || a == null) return FREE_ENTITLEMENTS
        return entitlementsForPlan(resolvePlano(a, planos))
    }

    // ─────────────────────── Datas ───────────────────────

    private const val DIA_MS = 24L * 60 * 60 * 1000

    /** Interpreta uma data ISO-8601 (aceita sufixo de fuso e fração de segundo). */
    fun parseIso(iso: String?): Long? {
        if (iso.isNullOrBlank()) return null
        return try {
            // java.time funciona a partir do Android 26; para minSdk 23 usamos
            // as APIs disponíveis sem dependências externas.
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli()
            } else {
                parseIsoCompat(iso)
            }
        } catch (_: Exception) {
            parseIsoCompat(iso)
        }
    }

    private fun parseIsoCompat(iso: String): Long? {
        return try {
            val limpo = iso.trim().replace(" ", "T")
            // Aceita: 2026-09-20T21:32:19.123456+00:00 / 2026-09-20T21:32:19Z
            val semFrac = limpo.replace(Regex("\\.\\d+"), "")
            val base = semFrac.substringBefore('+').substringBeforeLast('-', missingDelimiterValue = semFrac)

            val datePart = base.substringBefore('T')
            val timePart = base.substringAfter('T', "00:00:00").substringBefore('Z')
            val d = datePart.split("-")
            val t = timePart.split(":")
            val cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
            cal.set(
                d.getOrNull(0)?.toIntOrNull() ?: 1970,
                (d.getOrNull(1)?.toIntOrNull() ?: 1) - 1,
                d.getOrNull(2)?.toIntOrNull() ?: 1,
                t.getOrNull(0)?.toIntOrNull() ?: 0,
                t.getOrNull(1)?.toIntOrNull() ?: 0,
                t.getOrNull(2)?.toIntOrNull() ?: 0,
            )
            cal.set(java.util.Calendar.MILLISECOND, 0)
            cal.timeInMillis
        } catch (_: Exception) {
            null
        }
    }

    /** Dias restantes até o vencimento (inteiro, arredondado para cima; 0 = expirado). */
    fun diasRestantes(expiresAt: String?): Int {
        val fim = parseIso(expiresAt) ?: return 0
        val agora = System.currentTimeMillis()
        if (fim <= agora) return 0
        return Math.ceil((fim - agora).toDouble() / DIA_MS.toDouble()).toInt()
    }

    /** Data de vencimento formatada dd/mm/aaaa (ou "" se ausente). */
    fun formatarVencimento(expiresAt: String?): String {
        val ms = parseIso(expiresAt) ?: return ""
        val cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("America/Sao_Paulo"))
        cal.timeInMillis = ms
        val dd = String.format("%02d", cal.get(java.util.Calendar.DAY_OF_MONTH))
        val mm = String.format("%02d", cal.get(java.util.Calendar.MONTH) + 1)
        return "$dd/$mm/${cal.get(java.util.Calendar.YEAR)}"
    }

    /** Rótulo de dias restantes ("10 dias restantes" / "1 dia restante"). */
    fun rotuloDiasRestantes(expiresAt: String?): String {
        val dias = diasRestantes(expiresAt)
        if (dias <= 0) return "0 dias — assinatura expirada"
        return if (dias == 1) "1 dia restante" else "$dias dias restantes"
    }

    /** Preço formatado (R$ 29,90). */
    fun precoFormatado(priceCents: Int): String {
        val reais = priceCents / 100
        val cents = priceCents % 100
        return "R$ $reais,${String.format("%02d", cents)}"
    }

    /** Rótulo do limite de telas. */
    fun telasLabel(screens: Int): String =
        if (screens == 1) "1 tela simultânea" else "$screens telas simultâneas"

    /** Destaques legíveis de um plano (mesma ordem de `entitlementHighlights`). */
    fun destaques(plan: AccountRepository.Plano): List<String> {
        val e = entitlementsForPlan(plan)
        val downloadLabel = when {
            e.downloads <= 0 -> "Sem downloads offline"
            e.downloads == UNLIMITED -> "Downloads ilimitados"
            else -> "${e.downloads} downloads por mês"
        }
        val historyLabel = when {
            e.maxHistory <= 0 -> "Sem continuar assistindo"
            e.maxHistory == UNLIMITED -> "Continuar assistindo ilimitado"
            else -> "${e.maxHistory} títulos no continuar assistindo"
        }
        return listOf(
            "Qualidade até ${e.qualityLabel}",
            telasLabel(e.screens),
            downloadLabel,
            historyLabel,
            if (e.maxProfiles <= 1) "1 perfil" else "Até ${e.maxProfiles} perfis",
            "Catálogo completo liberado",
        )
    }
}

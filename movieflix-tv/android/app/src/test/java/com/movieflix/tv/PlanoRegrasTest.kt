package com.movieflix.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.temporal.ChronoUnit

/** Regras de plano/assinatura — as MESMAS do site (src/lib/plans.ts). */
class PlanoRegrasTest {

    private fun plano(code: String, priceCents: Int, days: Int = 30) =
        AccountRepository.Plano(id = "id-$code", code = code, name = code, priceCents = priceCents, description = "", features = emptyList(), durationDays = days)

    @Test
    fun premiumEh4kE4Telas() {
        val e = PlanoRegras.entitlementsForPlan(plano("premium", 3990))
        assertEquals(2160, e.maxHeight)
        assertEquals(4, e.screens)
        assertEquals(5, e.maxProfiles)
    }

    @Test
    fun padraoEh1080pE2Telas() {
        val e = PlanoRegras.entitlementsForPlan(plano("standard", 2990))
        assertEquals(1080, e.maxHeight)
        assertEquals(2, e.screens)
        assertEquals(3, e.maxProfiles)
    }

    @Test
    fun simplesEh720pE1Tela() {
        val e = PlanoRegras.entitlementsForPlan(plano("simple", 1990))
        assertEquals(720, e.maxHeight)
        assertEquals(1, e.screens)
        assertEquals(2, e.maxProfiles)
    }

    @Test
    fun planoDesconhecidoUsaOFaixaDePreco() {
        assertEquals(2160, PlanoRegras.entitlementsForPlan(plano("xyz", 5000)).maxHeight)
        assertEquals(1080, PlanoRegras.entitlementsForPlan(plano("xyz", 2600)).maxHeight)
        assertEquals(720, PlanoRegras.entitlementsForPlan(plano("xyz", 1000)).maxHeight)
    }

    @Test
    fun semAssinaturaEhGratuito() {
        assertFalse(AccountRepository.temAssinaturaAtiva(null))
        assertEquals(0, PlanoRegras.entitlementsForSubscription(null, false, emptyList()).maxHeight)
    }

    @Test
    fun resolvePlanoPorCodeEIdMisturados() {
        val planos = listOf(plano("premium", 3990), plano("standard", 2990))
        val a1 = AccountRepository.Assinatura(planCode = "premium", planId = null, status = "active", expiresAt = null, startsAt = null)
        assertEquals("premium", PlanoRegras.resolvePlano(a1, planos)?.code)
        val a2 = AccountRepository.Assinatura(planCode = null, planId = "id-standard", status = "active", expiresAt = null, startsAt = null)
        assertEquals("standard", PlanoRegras.resolvePlano(a2, planos)?.code)
    }

    @Test
    fun statusInativoNaoDaAcesso() {
        val a = AccountRepository.Assinatura(
            planCode = "premium", planId = null, status = "canceled",
            expiresAt = Instant.now().plus(10, ChronoUnit.DAYS).toString(), startsAt = null,
        )
        assertFalse(AccountRepository.temAssinaturaAtiva(a))
    }

    @Test
    fun assinaturaAtivaComVencimentoFuturoDaAcesso() {
        val a = AccountRepository.Assinatura(
            planCode = "premium", planId = null, status = "active",
            expiresAt = Instant.now().plus(10, ChronoUnit.DAYS).toString(), startsAt = null,
        )
        assertTrue(AccountRepository.temAssinaturaAtiva(a))
        assertTrue(AccountRepository.diasRestantes(a) in 9..10)
    }

    @Test
    fun assinaturaVencidaNaoDaAcesso() {
        val a = AccountRepository.Assinatura(
            planCode = "premium", planId = null, status = "active",
            expiresAt = Instant.now().minus(1, ChronoUnit.DAYS).toString(), startsAt = null,
        )
        assertFalse(AccountRepository.temAssinaturaAtiva(a))
        assertEquals(0, AccountRepository.diasRestantes(a))
    }

    @Test
    fun precoFormatado() {
        assertEquals("R$ 39,90", PlanoRegras.precoFormatado(3990))
        assertEquals("R$ 19,90", PlanoRegras.precoFormatado(1990))
        assertEquals("R$ 100,00", PlanoRegras.precoFormatado(10000))
    }

    @Test
    fun rotuloDias() {
        assertTrue(PlanoRegras.rotuloDiasRestantes(null).startsWith("0 dias"))
        assertEquals("1 dia restante", PlanoRegras.rotuloDiasRestantes(Instant.now().plusSeconds(3600).toString()))
    }

    @Test
    fun destaquesDoPremiumIncluemQualidadeETelas() {
        val destaques = PlanoRegras.destaques(plano("premium", 3990))
        assertTrue(destaques.any { it.contains("4K") })
        assertTrue(destaques.any { it.contains("4 telas") })
        assertTrue(destaques.any { it.contains("Downloads ilimitados") })
    }
}

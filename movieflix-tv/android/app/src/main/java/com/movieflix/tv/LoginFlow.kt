package com.movieflix.tv

/**
 * Fluxo de PREENCHIMENTO do login na TV — lógica PURA (testável em JVM).
 *
 * ── O que o dono pediu ─────────────────────────────────────────────────────────
 *
 * Um login que o controle remoto consiga completar SEM sair do teclado:
 *
 *   seleciona E-MAIL → teclado sobe → digita o e-mail inteiro
 *     → ENTER no teclado  → o foco vai para a SENHA (o teclado continua aberto)
 *     → digita a senha inteira
 *     → ENTER de novo     → o foco vai para ENTRAR (teclado recolhe)
 *     → OK em ENTRAR      → executa o login.
 *
 * ── Por que existe este arquivo ────────────────────────────────────────────────
 *
 * Antes, a única tecla de confirmação do teclado (`rotuloConfirmar`) executava o
 * LOGIN. Ou seja: quem apertasse ENTER ainda no e-mail disparava `signInWithPassword`
 * com a senha VAZIA e recebia um erro — e não existia nenhuma forma de "ir para o
 * próximo campo" pelo controle, a não ser navegar por cima do teclado até o campo.
 *
 * Este objeto decide, de forma determinística, QUAL é o próximo destino. Nenhuma
 * regra de autenticação vive aqui: quem autentica continua sendo o AuthRepository
 * (mesma conta Supabase, mesmos endpoints, mesmas regras do site e do celular).
 */
object LoginFlow {

    /** Próximo destino quando o usuário aperta ENTER no teclado. */
    enum class Passo {
        /** E-mail preenchido → vá para a SENHA (teclado continua aberto). */
        SENHA,

        /** Senha preenchida → vá para o botão ENTRAR (teclado recolhe). */
        ENTRAR,

        /** Não há campo em edição — nada a avançar. */
        NENHUM,
    }

    /**
     * Decide o próximo passo a partir do CAMPO que está sendo editado.
     *
     * E-MAIL → SENHA · SENHA → ENTRAR · nenhum → NENHUM.
     */
    fun proximoPasso(campoAtual: CampoLogin?): Passo = when (campoAtual) {
        CampoLogin.EMAIL -> Passo.SENHA
        CampoLogin.SENHA -> Passo.ENTRAR
        null -> Passo.NENHUM
    }

    /**
     * Campo seguinte ao atual (usado quando o passo é [Passo.SENHA]).
     * Do último campo não há próximo: devolve `null`.
     */
    fun proximoCampo(campoAtual: CampoLogin?): CampoLogin? = when (campoAtual) {
        CampoLogin.EMAIL -> CampoLogin.SENHA
        else -> null
    }

    /**
     * O ENTER pode avançar? (o e-mail não precisa estar preenchido para o usuário
     * PULAR para a senha — quem decide se dá para entrarem é o botão ENTRAR, que
     * valida os dois campos em `tentarLogin`).
     */
    fun podeAvancar(campoAtual: CampoLogin?): Boolean =
        proximoPasso(campoAtual) != Passo.NENHUM
}

/** Campo de login, na ordem em que o fluxo os percorre. */
enum class CampoLogin { EMAIL, SENHA }

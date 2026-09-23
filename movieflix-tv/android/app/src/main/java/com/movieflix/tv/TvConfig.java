package com.movieflix.tv;

/**
 * MovieFlix TV — configuração central do app.
 *
 * Fica em uma classe Java pura (sem dependências do Android) para poder ser
 * verificada por testes unitários de JVM: garante que o app aponta para a
 * EXPERIÊNCIA TV no domínio OFICIAL do MovieFlix — a mesma origem de dados do
 * site e do app mobile — e não para um catálogo/backend paralelo.
 *
 * ── AUDITORIA (correção do player 4.0.1) ─────────────────────────────────────
 * A produção do SITE só permite iframe. O provedor de vídeo (StreamBetter) e a
 * verificação Cloudflare/Turnstile rodam DENTRO do iframe do player. A regra
 * anterior mantinha no WebView apenas o domínio do MovieFlix: qualquer
 * navegação de iframe para o provedor era "expulsa" para um app externo. Isso
 * trocava a página inteira pelo navegador (o usuário saía do app de TV), e o
 * embed — que precisa permanecer enquadrado — nunca conseguia carregar.
 *
 * Agora a decisão tem TRÊS listas e é aplicada por FRAME (ver MainActivity):
 *   1. domínio oficial do MovieFlix  → fica no WebView;
 *   2. domínios do PLAYER (abaixo)   → ficam no WebView, inclusive em iframe;
 *   3. domínios de VERIFICAÇÃO       → ficam no WebView (o desafio precisa
 *      concluir UMA vez para a reprodução continuar).
 * Tudo o mais continua sendo tratado pela camada nativa.
 */
public final class TvConfig {

    private TvConfig() {}

    /** Host oficial do MovieFlix. */
    public static final String HOST_OFICIAL = "movieflix-bszf.onrender.com";

    /**
     * URL da experiência de TV. É a MESMA aplicação (mesmos dados, mesma conta,
     * mesmo backend) com interface adaptada para televisão.
     */
    public static final String TV_URL = "https://" + HOST_OFICIAL + "/#/tv";

    /** Marcador de versão no User-Agent. */
    public static final String TV_UA_SUFIXO = " MovieFlixTV/5.0.1";

    /** Versão do produto (deve espelhar o build.gradle). */
    public static final String VERSAO = "5.0.1";
    public static final int VERSAO_CODIGO = 501;

    /**
     * Teto de teclas que a PÁGINA pode pedir para receber
     * (ver {@link #teclasDeNavegacao(int[])}).
     */
    public static final int LIMITE_TECLAS_PAGINA = 32;

    /** Paleta oficial da marca, idêntica à do site (tailwind.config.js). */
    public static final int COR_VERMELHO = 0xFFDF0A15;
    public static final int COR_ROXO = 0xFF7C3AED;
    public static final int COR_FUNDO = 0xFF0A0A0F;

    /**
     * Domínios do PROVEDOR DE VÍDEO. Precisam ficar no WebView — inclusive
     * quando a navegação acontece DENTRO de um iframe (é assim que o player do
     * site carrega o embed). Expulsá-los trocava a página pelo navegador
     * externo e derrubava a reprodução.
     *
     * Espelha a lista de domínios permitidos em `src/lib/antiAds.ts`.
     */
    public static final String[] HOSTS_PLAYER = {
            "streambetter.shop",
            "yapgrid.com",
            "playerflixapi.com",
            "megaembedapi.site",
            "embedplayapi.site",
            "watchplayer.shop",
            "embedplayer2.xyz",
            "superflixapi.life",
            "warezcdn.link",
    };

    /**
     * Domínios de VERIFICAÇÃO (Cloudflare/Turnstile). NUNCA podem ser tocados:
     * o desafio roda em iframes aninhados no player e precisa concluir UMA vez
     * para a reprodução seguir.
     */
    public static final String[] HOSTS_VERIFICACAO = {
            "challenges.cloudflare.com",
            "cloudflare.com",
            "turnstile",
    };

    /**
     * Valida e normaliza as teclas que a página pediu para receber.
     *
     * ── CORREÇÃO DO BUG DOS BOTÕES DO PLAYER (5.0.0) ──────────────────────────
     * A camada nativa consumia o D-pad e as teclas de mídia antes de o WebView
     * recebê-las, então os botões do player não respondiam ao controle remoto. A
     * página agora PEDE as teclas pela ponte `MovieFlixApp.setTeclasNavegacao`,
     * passando pelos filtros abaixo.
     *
     * Fica aqui (Java puro, sem Android) para poder ser testado na JVM: garante
     * que um pedido vindo da página nunca consiga liberar mais do que um conjunto
     * pequeno de teclas plausíveis — o resto continua com o comportamento nativo
     * (Voltar hierárquico e saída do app).
     *
     * @param codigos keyCodes pedidos pelo site (pode ser nulo).
     * @return códigos válidos, sem repetição; vazio quando a lista é nula/vazia.
     */
    public static java.util.Set<Integer> teclasDeNavegacao(int[] codigos) {
        java.util.Set<Integer> aceitas = new java.util.LinkedHashSet<>();
        if (codigos == null) return aceitas;
        int limite = Math.min(codigos.length, LIMITE_TECLAS_PAGINA);
        for (int i = 0; i < limite; i++) {
            int c = codigos[i];
            if (c > 0 && c <= 300) aceitas.add(c);
        }
        return aceitas;
    }

    /**
     * KeyCodes de MÍDIA do Android (android.view.KeyEvent).
     *
     * Duplicados aqui de propósito: TvConfig é Java PURO (sem Android) para
     * poder ser verificado por testes de JVM. Os valores são os mesmos da
     * plataforma e há teste garantindo isso.
     */
    public static final int KEYCODE_MEDIA_FAST_FORWARD = 90;
    public static final int KEYCODE_MEDIA_REWIND = 89;

    /**
     * A REPETIÇÃO de uma tecla de mídia deve ser repassada à página?
     *
     * ── CORREÇÃO 5.0.1 (relato: "pausar, retomar, avançar e retroceder não
     * respondem ao controle remoto") ──────────────────────────────
     * O Android REPETE o ACTION_DOWN enquanto a tecla permanece pressionada, e
     * essa repetição tem significados OPOSTOS conforme a tecla:
     *
     *  • ◀◀ / ▶▶ (MEDIA_REWIND / MEDIA_FAST_FORWARD): a repetição É o SEEK
     *    CONTÍNUO — cada repetição é mais um passo, então SEGURAR o botão
     *    avança/retrocede progressivamente e soltar para o movimento. É o gesto
     *    que o usuário pediu ("ao pressionar e SEGURAR para frente, a reprodução
     *    avana progressivamente").
     *  • PLAY/PAUSE, NEXT/PREVIOUS, STOP: repetir seria ERRADO — um play/pause
     *    segurado ficaria alternando sem parar. Só a PRIMEIRA pulsacão age.
     *
     * Fica aqui para ser coberto por teste de JVM: é a regra que decide se o
     * gesto de SEGURAR funciona.
     */
    public static boolean repeticaoDeMidiaAceita(int keyCode, int repeatCount) {
        if (repeatCount <= 0) return true; // primeira pulsacão: sempre passa
        return keyCode == KEYCODE_MEDIA_FAST_FORWARD || keyCode == KEYCODE_MEDIA_REWIND;
    }

    /** O host pertence a um domínio do provedor de vídeo? */
    public static boolean ehHostPlayer(String host) {
        if (host == null || host.isEmpty()) return false;
        String h = host.toLowerCase();
        for (String d : HOSTS_PLAYER) {
            if (h.equals(d) || h.endsWith("." + d)) return true;
        }
        return false;
    }

    /** O host pertence à verificação Cloudflare/Turnstile? */
    public static boolean ehHostVerificacao(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        for (String d : HOSTS_VERIFICACAO) {
            if (h.equals(d) || h.endsWith("." + d) || h.contains(d)) return true;
        }
        return false;
    }

    /** O host pertence ao MovieFlix (domínio oficial ou subdomínio)? */
    public static boolean ehHostOficial(String host) {
        if (host == null || host.isEmpty()) return false;
        String h = host.toLowerCase();
        return h.equals(HOST_OFICIAL) || h.endsWith("." + HOST_OFICIAL);
    }

    /**
     * Extrai o host (minúsculo, sem porta) de uma URL http/https.
     * Devolve "" quando não for uma URL http/https válida.
     */
    public static String host(String url) {
        if (url == null) return "";
        String minuscula = url.toLowerCase();
        int esquema = minuscula.indexOf("://");
        if (esquema < 0) return "";
        if (!minuscula.startsWith("http://") && !minuscula.startsWith("https://")) return "";
        String resto = minuscula.substring(esquema + 3);
        int barra = resto.indexOf('/');
        String host = barra < 0 ? resto : resto.substring(0, barra);
        int interrogacao = host.indexOf('?');
        if (interrogacao >= 0) host = host.substring(0, interrogacao);
        int hash = host.indexOf('#');
        if (hash >= 0) host = host.substring(0, hash);
        int doisPontos = host.indexOf(':');
        if (doisPontos >= 0) host = host.substring(0, doisPontos);
        return host;
    }

    /**
     * Uma URL deve ficar DENTRO do WebView?
     *
     * Ficam: o domínio oficial do MovieFlix, os domínios do PROVEDOR (o embed
     * precisa permanecer enquadrado para reproduzir) e os domínios de
     * VERIFICAÇÃO (Cloudflare/Turnstile). O resto é tratado pela camada nativa.
     */
    public static boolean ficaNoWebView(String url) {
        if (url == null || url.isEmpty()) return false;
        String minuscula = url.toLowerCase();
        if (!minuscula.startsWith("http://") && !minuscula.startsWith("https://")) return false;
        String host = host(url);
        if (host.isEmpty()) return false;
        return ehHostOficial(host) || ehHostPlayer(host) || ehHostVerificacao(host);
    }

    /** Esquemas que devem ser entregues a um app externo do sistema. */
    public static boolean ehEsquemaExterno(String url) {
        if (url == null) return false;
        String m = url.toLowerCase();
        return m.startsWith("whatsapp://") || m.startsWith("tel:") || m.startsWith("mailto:")
                || m.startsWith("market://") || m.startsWith("intent:");
    }

    /**
     * Esquemas que NUNCA devem sair do WebView (conteúdo interno do documento,
     * não uma navegação). Tratá-los como "site externo" trocaria a página do
     * app por um app inútil.
     */
    public static boolean ehEsquemaInterno(String url) {
        if (url == null) return false;
        String m = url.toLowerCase();
        return m.startsWith("data:") || m.startsWith("blob:") || m.startsWith("about:")
                || m.startsWith("javascript:") || m.startsWith("file:") || m.startsWith("content:");
    }
}

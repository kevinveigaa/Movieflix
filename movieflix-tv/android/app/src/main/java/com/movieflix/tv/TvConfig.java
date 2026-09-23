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
    public static final String TV_UA_SUFIXO = " MovieFlixTV/4.0.1";

    /** Versão do produto (deve espelhar o build.gradle). */
    public static final String VERSAO = "4.0.1";
    public static final int VERSAO_CODIGO = 41;

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

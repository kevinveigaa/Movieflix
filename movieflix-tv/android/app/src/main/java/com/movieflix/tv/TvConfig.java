package com.movieflix.tv;

/**
 * MovieFlix TV — configuração central do app.
 *
 * Fica em uma classe Java pura (sem dependências do Android) para poder ser
 * verificada por testes unitários de JVM: garante que o app aponta para a
 * EXPERIÊNCIA TV no domínio OFICIAL do MovieFlix — a mesma origem de dados do
 * site e do app mobile — e não para um catálogo/backend paralelo.
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
     * Uma URL deve ficar DENTRO do WebView? (só o domínio oficial do MovieFlix).
     * Tudo o resto (WhatsApp, tel, mailto, outros sites) abre em app externo.
     */
    public static boolean ficaNoWebView(String url) {
        if (url == null || url.isEmpty()) return false;
        String minuscula = url.toLowerCase();
        int esquema = minuscula.indexOf("://");
        if (esquema < 0) return false;
        if (!minuscula.startsWith("http://") && !minuscula.startsWith("https://")) return false;
        String resto = minuscula.substring(esquema + 3);
        int barra = resto.indexOf('/');
        String host = barra < 0 ? resto : resto.substring(0, barra);
        int doisPontos = host.indexOf(':');
        if (doisPontos >= 0) host = host.substring(0, doisPontos);
        return host.equals(HOST_OFICIAL) || host.endsWith("." + HOST_OFICIAL);
    }

    /** Esquemas que devem ser entregues a um app externo do sistema. */
    public static boolean ehEsquemaExterno(String url) {
        if (url == null) return false;
        String m = url.toLowerCase();
        return m.startsWith("whatsapp://") || m.startsWith("tel:") || m.startsWith("mailto:")
                || m.startsWith("market://") || m.startsWith("intent:");
    }
}

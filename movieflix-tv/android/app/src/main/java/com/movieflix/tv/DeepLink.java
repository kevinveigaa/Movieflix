package com.movieflix.tv;

/**
 * MovieFlix TV — Deep link → URL do site.
 *
 * O MovieFlix TV é o MESMO MovieFlix: o app abre o site oficial já dentro da
 * interface de TV. Este helper traduz um deep link `movieflix://...` para a
 * rota equivalente do site, preservando o conteúdo escolhido.
 *
 * Formatos aceitos (compatíveis com o app Mobile e com o site):
 *   movieflix://tv/detalhe/{type}/{id}        → #/tv/detalhe/{type}/{id}
 *   movieflix://tv/assistir/{id}?season=S&episode=E
 *                                             → #/tv/assistir/{id}?season=S&episode=E
 *   movieflix://titulo/{type}/{id}            → #/tv/detalhe/{type}/{id}
 *   movieflix://assistir/{id}?season=S&ep=E   → #/tv/assistir/{id}?season=S&episode=E
 *
 * Implementado com manipulação pura de String (sem android.net.Uri) para poder
 * ser coberto por teste unitário na JVM.
 */
public final class DeepLink {

    public static final String HOST = "movieflix";

    private DeepLink() {}

    /** Uma URL é um deep link do MovieFlix? */
    public static boolean ehDeepLink(String url) {
        if (url == null || url.isEmpty()) return false;
        String u = url.trim();
        return u.startsWith("movieflix:") || u.startsWith("movieflix://");
    }

    /**
     * Converte o deep link na URL completa do site (com o fragmento/hash do
     * HashRouter). Retorna null se o link não for reconhecido.
     *
     * @param siteBase ex.: "https://movieflix-bszf.onrender.com"
     */
    public static String paraUrlSite(String url, String siteBase) {
        if (!ehDeepLink(url)) return null;
        String resto = url.trim();
        if (resto.startsWith("movieflix://")) resto = resto.substring("movieflix://".length());
        else resto = resto.substring("movieflix:".length());
        while (resto.startsWith("/")) resto = resto.substring(1);
        if (resto.isEmpty()) return null;

        String caminho = resto;
        String query = "";
        int q = resto.indexOf('?');
        if (q >= 0) {
            caminho = resto.substring(0, q);
            query = resto.substring(q + 1).trim();
        }
        caminho = caminho.trim();

        String[] segmentos = caminho.split("/");
        // remove segmentos vazios
        java.util.List<String> seg = new java.util.ArrayList<>();
        for (String s : segmentos) if (!s.isEmpty()) seg.add(s);
        if (seg.isEmpty()) return null;

        String rota;
        String first = seg.get(0);
        if ("tv".equals(first)) {
            rota = "/" + String.join("/", seg);
        } else if ("detalhe".equals(first) && seg.size() >= 3) {
            rota = "/tv/detalhe/" + seg.get(1) + "/" + seg.get(2);
        } else if ("titulo".equals(first) && seg.size() >= 3) {
            rota = "/tv/detalhe/" + seg.get(1) + "/" + seg.get(2);
        } else if ("titulo".equals(first) && seg.size() == 2) {
            rota = "/tv/detalhe/movie/" + seg.get(1);
        } else if ("assistir".equals(first) && seg.size() >= 2) {
            rota = "/tv/assistir/" + seg.get(1);
        } else {
            return null;
        }

        String qs = normalizarQuery(query);
        String base = siteBase.endsWith("/") ? siteBase.substring(0, siteBase.length() - 1) : siteBase;
        return qs.isEmpty() ? base + "/#" + rota : base + "/#" + rota + "?" + qs;
    }

    /** Padroniza `ep` → `episode` (o site aceita `ep`, mas mantemos canônico). */
    private static String normalizarQuery(String query) {
        if (query == null || query.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (String par : query.split("&")) {
            int eq = par.indexOf('=');
            if (eq <= 0) continue;
            String chave = par.substring(0, eq);
            String valor = par.substring(eq + 1);
            if (chave.isEmpty()) continue;
            if ("ep".equals(chave)) chave = "episode";
            if (sb.length() > 0) sb.append('&');
            sb.append(chave).append('=').append(valor);
        }
        return sb.toString();
    }
}

package com.movieflix.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Type;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Cliente do backend do MovieFlix.
 *
 * O catálogo do site é servido como JSONs estáticos em /filmes/*.json
 * (filmes.light.json + series.light.json). Este cliente baixa esses JSONs
 * do site real, garantindo que o app mostre EXATAMENTE o mesmo conteúdo do
 * site — quando um filme/série é adicionado no painel/banco, aparece
 * automaticamente no app (sem cadastrar duas vezes).
 *
 * Usa cache em disco (SharedPreferences) para abrir instantaneamente na
 * segunda visita e valida em background.
 */
public final class BackendClient {

    public static final String SITE_URL = "https://movieflix-bszf.onrender.com";
    private static final String CACHE_KEY = "mf_catalog_v33";
    private static final long CACHE_TTL_MS = 1000L * 60 * 60 * 6; // 6h

    private static final ExecutorService EXECUTOR = Executors.newFixedThreadPool(3);
    private static final Gson GSON = new Gson();

    private static List<Title> filmes = new ArrayList<>();
    private static List<Title> series = new ArrayList<>();
    private static boolean carregado = false;

    private BackendClient() {}

    /** Baixa o catálogo do site (filmes + séries) e atualiza o cache. */
    public static void carregarCatalogo(final Context ctx, final Runnable onDone) {
        EXECUTOR.execute(() -> {
            try {
                List<Title> f = baixarLista(SITE_URL + "/filmes/filmes.light.json");
                List<Title> s = baixarLista(SITE_URL + "/filmes/series.light.json");
                synchronized (BackendClient.class) {
                    if (f != null) filmes = f;
                    if (s != null) series = s;
                    carregado = true;
                }
                salvarCache(ctx, filmes, series);
            } catch (Exception e) {
                e.printStackTrace();
                // Fallback: usa o cache local se a rede falhar.
                List<Title>[] cache = lerCache(ctx);
                if (cache != null) {
                    synchronized (BackendClient.class) {
                        filmes = cache[0];
                        series = cache[1];
                        carregado = true;
                    }
                }
            }
            if (onDone != null) onDone.run();
        });
    }

    private static List<Title> baixarLista(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setRequestProperty("Accept", "application/json");
        conn.setRequestProperty("User-Agent", "MovieFlix-Android/3.3");
        int code = conn.getResponseCode();
        if (code != 200) {
            conn.disconnect();
            return null;
        }
        InputStream is = conn.getInputStream();
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line);
        reader.close();
        conn.disconnect();
        Type type = new TypeToken<List<Title>>() {}.getType();
        return GSON.fromJson(sb.toString(), type);
    }

    private static void salvarCache(Context ctx, List<Title> f, List<Title> s) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences("movieflix_cache", Context.MODE_PRIVATE);
            sp.edit()
                    .putString("filmes", GSON.toJson(f))
                    .putString("series", GSON.toJson(s))
                    .putLong("savedAt", System.currentTimeMillis())
                    .apply();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Title>[] lerCache(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences("movieflix_cache", Context.MODE_PRIVATE);
            long savedAt = sp.getLong("savedAt", 0);
            if (System.currentTimeMillis() - savedAt > CACHE_TTL_MS) return null;
            String fJson = sp.getString("filmes", null);
            String sJson = sp.getString("series", null);
            if (fJson == null || sJson == null) return null;
            Type type = new TypeToken<List<Title>>() {}.getType();
            List<Title> f = GSON.fromJson(fJson, type);
            List<Title> s = GSON.fromJson(sJson, type);
            return new List[]{ f, s };
        } catch (Exception e) {
            return null;
        }
    }

    public static synchronized List<Title> getFilmes() { return filmes; }
    public static synchronized List<Title> getSeries() { return series; }

    public static synchronized List<Title> getTodos() {
        List<Title> todos = new ArrayList<>();
        todos.addAll(filmes);
        todos.addAll(series);
        return todos;
    }

    public static synchronized Title buscarPorId(String id) {
        for (Title t : filmes) if (t.id != null && t.id.equals(id)) return t;
        for (Title t : series) if (t.id != null && t.id.equals(id)) return t;
        return null;
    }

    public static synchronized boolean isCarregado() { return carregado; }
}
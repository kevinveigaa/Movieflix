package com.movieflix.app;

import android.content.Context;
import android.content.res.AssetManager;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;

import java.io.InputStream;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Carrega o catálogo de filmes/séries do JSON embutido em assets.
 */
public final class CatalogRepository {

    private static List<Title> filmes = new ArrayList<>();
    private static List<Title> series = new ArrayList<>();
    private static boolean carregado = false;

    private CatalogRepository() {}

    public static synchronized void carregar(Context context) {
        if (carregado) return;
        try {
            AssetManager am = context.getAssets();
            InputStream is = am.open("catalogo.json");
            byte[] buffer = new byte[is.available()];
            int read = is.read(buffer);
            is.close();
            String json = new String(buffer, 0, read, StandardCharsets.UTF_8);

            Gson gson = new Gson();
            Type type = new TypeToken<Catalogo>() {}.getType();
            Catalogo cat = gson.fromJson(json, type);
            if (cat != null) {
                if (cat.filmes != null) filmes = cat.filmes;
                if (cat.series != null) series = cat.series;
            }
            carregado = true;
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static List<Title> getFilmes() { return filmes; }
    public static List<Title> getSeries() { return series; }

    public static List<Title> getTodos() {
        List<Title> todos = new ArrayList<>();
        todos.addAll(filmes);
        todos.addAll(series);
        return todos;
    }

    public static Title buscarPorId(String id) {
        for (Title t : filmes) if (t.id != null && t.id.equals(id)) return t;
        for (Title t : series) if (t.id != null && t.id.equals(id)) return t;
        return null;
    }

    private static class Catalogo {
        List<Title> filmes;
        List<Title> series;
    }

    // Helper para TypeToken (evita warning de raw type)
    private static class TypeTokenType extends TypeToken<Catalogo> {}
}
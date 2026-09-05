package com.movieflix.app;

import com.google.gson.annotations.SerializedName;

import java.util.List;

/**
 * Modelo de um título (filme ou série) do catálogo.
 * Campos alinhados com o JSON servido pelo site em /filmes/*.json.
 */
public class Title {
    public String id;
    public String title;
    public String description;
    @SerializedName("poster_url")
    public String posterUrl;
    @SerializedName("backdrop_url")
    public String backdropUrl;
    @SerializedName("video_url")
    public String videoUrl;
    @SerializedName("vote_average")
    public Double rating;
    public String year;
    public String category;
    public String language;
    public String quality;
    public String type; // "movie" ou "series"
    @SerializedName("media_type")
    public String mediaType;
    @SerializedName("tmdb_id")
    public String tmdbId;
    public Integer duration;
    public Integer seasons;
    public Integer episodes;
    @SerializedName("episodes_available")
    public List<String> eps;
    @SerializedName("dublado_ptbr")
    public Boolean dubladoPtbr;

    public boolean isSeries() {
        return "series".equalsIgnoreCase(type)
                || "tv".equalsIgnoreCase(type)
                || "tv".equalsIgnoreCase(mediaType);
    }

    /** URL do embed do StreamBetter para este título (mesmo player do site). */
    public String getStreamUrl() {
        if (videoUrl != null && !videoUrl.isEmpty()) return videoUrl;
        if (tmdbId == null || tmdbId.isEmpty()) return "";
        if (isSeries()) {
            // Série: usa o primeiro episódio disponível.
            if (eps != null && !eps.isEmpty()) {
                String primeiro = eps.get(0);
                String[] partes = primeiro.split("/");
                if (partes.length == 2) {
                    return "https://streambetter.shop/serie/" + tmdbId + "/" + partes[0] + "/" + partes[1] + "?lang=pt-BR";
                }
            }
            return "https://streambetter.shop/serie/" + tmdbId + "/1/1?lang=pt-BR";
        }
        return "https://streambetter.shop/filme/" + tmdbId + "?lang=pt-BR";
    }
}
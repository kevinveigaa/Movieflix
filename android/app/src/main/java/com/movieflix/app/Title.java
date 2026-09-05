package com.movieflix.app;

import com.google.gson.annotations.SerializedName;

import java.util.List;

/** Modelo de um título (filme ou série) do catálogo. */
public class Title {
    public String id;
    public String title;
    public String desc;
    @SerializedName("poster")
    public String posterUrl;
    @SerializedName("backdrop")
    public String backdropUrl;
    @SerializedName("video")
    public String videoUrl;
    public Double rating;
    public String year;
    public String cat;
    public String lang;
    public String quality;
    public String type; // "movie" ou "series"
    public Integer seasons;
    public Integer episodes;
    public List<String> eps;

    public boolean isSeries() {
        return "series".equalsIgnoreCase(type) || "tv".equalsIgnoreCase(type);
    }
}
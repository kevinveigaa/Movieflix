package com.movieflix.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Cliente do Supabase (mesmo backend do site).
 *
 * Replica o fluxo de autenticação e assinaturas do site via REST API:
 *  - Auth: signIn, signUp, resetPassword, signOut (token JWT persistido).
 *  - Dados: profiles, subscriptions, plans, favorites.
 *
 * O usuário entra com a MESMA conta do site e o app reconhece o MESMO status
 * de assinatura (bloqueia conteúdo premium se expirado).
 */
public final class SupabaseClient {

    public static final String SUPABASE_URL = "https://mntyanfhxiqspdedmddb.supabase.co";
    public static final String SUPABASE_ANON_KEY =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udHlhbmZoeGlxc3BkZWRtZGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NTA5MzEsImV4cCI6MjEwMTAyNjkzMX0.FxGmpM7-PIwj-XP-l6KC2G0L425X7e2zANGS03xrbr0";

    private static final ExecutorService EXECUTOR = Executors.newFixedThreadPool(3);
    private static final Gson GSON = new Gson();

    private static String accessToken;
    private static String userId;
    private static String userEmail;
    private static JsonObject profile;
    private static JsonObject subscriptionObj;
    private static List<JsonObject> plans = new ArrayList<>();

    private SupabaseClient() {}

    // ---------- Sessão persistida ----------

    public static void restaurarSessao(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences("movieflix_session", Context.MODE_PRIVATE);
        accessToken = sp.getString("access_token", null);
        userId = sp.getString("user_id", null);
        userEmail = sp.getString("user_email", null);
    }

    private static void salvarSessao(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences("movieflix_session", Context.MODE_PRIVATE);
        sp.edit()
                .putString("access_token", accessToken)
                .putString("user_id", userId)
                .putString("user_email", userEmail)
                .apply();
    }

    public static void limparSessao(Context ctx) {
        accessToken = null;
        userId = null;
        userEmail = null;
        subscriptionObj = null;
        ctx.getSharedPreferences("movieflix_session", Context.MODE_PRIVATE).edit().clear().apply();
    }

    public static boolean isLogado() {
        return accessToken != null && !accessToken.isEmpty();
    }

    public static String getUserId() { return userId; }
    public static String getUserEmail() { return userEmail; }

    // ================= Auth =================

    public interface AuthCallback {
        void onResult(boolean success, String error);
    }

    /** Login com e-mail e senha (mesma conta do site). */
    public static void signIn(Context ctx, String email, String password, AuthCallback cb) {
        EXECUTOR.execute(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("email", email);
                body.addProperty("password", password);
                JsonObject resp = postJson(SUPABASE_URL + "/auth/v1/token?grant_type=password", body, true);
                if (resp.has("access_token")) {
                    accessToken = resp.get("access_token").getAsString();
                    userId = resp.get("user").getAsJsonObject().get("id").getAsString();
                    userEmail = email;
                    salvarSessao(ctx);
                    carregarPerfilUsuario(ctx);
                    cb.onResult(true, null);
                } else {
                    cb.onResult(false, extrairErro(resp));
                }
            } catch (Exception e) {
                cb.onResult(false, e.getMessage());
            }
        });
    }

    /** Cadastro com e-mail e senha. */
    public static void signUp(Context ctx, String email, String password, AuthCallback cb) {
        EXECUTOR.execute(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("email", email);
                body.addProperty("password", password);
                JsonObject resp = postJson(SUPABASE_URL + "/auth/v1/signup", body, true);
                if (resp.has("access_token") && !resp.get("access_token").isJsonNull()) {
                    accessToken = resp.get("access_token").getAsString();
                    userId = resp.get("user").getAsJsonObject().get("id").getAsString();
                    userEmail = email;
                    salvarSessao(ctx);
                    cb.onResult(true, null);
                } else if (resp.has("id") || (resp.has("user") && !resp.get("user").isJsonNull())) {
                    // E-mail já cadastrado / confirmação pendente.
                    cb.onResult(false, "Conta criada. Verifique seu e-mail para confirmar o cadastro.");
                } else {
                    cb.onResult(false, extrairErro(resp));
                }
            } catch (Exception e) {
                cb.onResult(false, e.getMessage());
            }
        });
    }

    /** Recuperação de senha (envia e-mail). */
    public static void resetPassword(String email, AuthCallback cb) {
        EXECUTOR.execute(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("email", email);
                postJson(SUPABASE_URL + "/auth/v1/recover", body, true);
                cb.onResult(true, null);
            } catch (Exception e) {
                cb.onResult(false, e.getMessage());
            }
        });
    }

    public static void signOut(Context ctx, AuthCallback cb) {
        EXECUTOR.execute(() -> {
            try {
                if (accessToken != null) {
                    postJson(SUPABASE_URL + "/auth/v1/logout", new JsonObject(), false);
                }
            } catch (Exception ignored) {}
            limparSessao(ctx);
            if (cb != null) cb.onResult(true, null);
        });
    }

    // ================= Dados =================

    /** Carrega profile + subscription + plans do usuário logado. */
    public static void carregarPerfilUsuario(Context ctx) {
        if (!isLogado()) return;
        EXECUTOR.execute(() -> {
            try {
                // Profile
                JsonArray prof = getJson(SUPABASE_URL + "/rest/v1/profiles?select=*&id=eq." + userId);
                if (prof != null && prof.size() > 0) {
                    // profile salvo em memória (não usado diretamente aqui)
                }
                // Subscription (mais recente)
                JsonArray subs = getJson(SUPABASE_URL + "/rest/v1/subscriptions?select=*&user_id=eq."
                        + userId + "&order=created_at.desc&limit=1");
                if (subs != null && subs.size() > 0) {
                    subscriptionObj = subs.get(0).getAsJsonObject();
                } else {
                    subscriptionObj = null;
                }
                // Plans
                JsonArray pl = getJson(SUPABASE_URL + "/rest/v1/plans?select=*&order=price_cents.asc");
                plans.clear();
                if (pl != null) {
                    for (JsonElement e : pl) plans.add(e.getAsJsonObject());
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    public static JsonObject getSubscription() { return subscriptionObj; }

    /** true se o usuário tem assinatura ativa (status=active e expires_at > agora). */
    public static boolean temAssinaturaAtiva() {
        if (subscriptionObj == null) return false;
        String status = subscriptionObj.has("status") ? subscriptionObj.get("status").getAsString() : "";
        if (!"active".equalsIgnoreCase(status)) return false;
        if (!subscriptionObj.has("expires_at") || subscriptionObj.get("expires_at").isJsonNull()) return false;
        try {
            long exp = java.time.Instant.parse(subscriptionObj.get("expires_at").getAsString()).toEpochMilli();
            return exp > System.currentTimeMillis();
        } catch (Exception e) {
            return false;
        }
    }

    public static List<JsonObject> getPlans() { return plans; }

    // ================= HTTP helpers =================

    private static JsonObject postJson(String urlStr, JsonObject body, boolean anon) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("apikey", SUPABASE_ANON_KEY);
        if (anon) {
            conn.setRequestProperty("Authorization", "Bearer " + SUPABASE_ANON_KEY);
        } else if (accessToken != null) {
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
        }
        OutputStream os = conn.getOutputStream();
        os.write(body.toString().getBytes(StandardCharsets.UTF_8));
        os.flush();
        os.close();
        int code = conn.getResponseCode();
        InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
        String resp = lerStream(is);
        conn.disconnect();
        if (resp == null || resp.isEmpty()) return new JsonObject();
        return JsonParser.parseString(resp).getAsJsonObject();
    }

    private static JsonArray getJson(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setRequestProperty("apikey", SUPABASE_ANON_KEY);
        if (accessToken != null) {
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
        }
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
        return JsonParser.parseString(sb.toString()).getAsJsonArray();
    }

    private static String lerStream(InputStream is) throws Exception {
        if (is == null) return "";
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line);
        reader.close();
        return sb.toString();
    }

    private static String extrairErro(JsonObject resp) {
        try {
            if (resp.has("error_description")) return resp.get("error_description").getAsString();
            if (resp.has("msg")) return resp.get("msg").getAsString();
            if (resp.has("message")) return resp.get("message").getAsString();
            if (resp.has("error")) return resp.get("error").getAsString();
        } catch (Exception ignored) {}
        return "Erro de autenticação";
    }
}
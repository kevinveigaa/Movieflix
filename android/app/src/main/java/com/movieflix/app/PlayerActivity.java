package com.movieflix.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Player de v\u00eddeo dedicado do MovieFlix.
 *
 * Reproduz o player oficial do StreamBetter (o mesmo usado no site) para o
 * filme/s\u00e9rie selecionado. O app principal \u00e9 100% nativo (sem WebView);
 * este WebView \u00e9 usado APENAS para reproduzir o v\u00eddeo, pois o provedor
 * (StreamBetter) entrega o player via embed web.
 *
 * Configura\u00e7\u00e3o correta para o player:
 *  - JavaScript, DOM storage e reprodu\u00e7\u00e3o de m\u00eddia habilitados.
 *  - WebChromeClient com suporte a fullscreen e popups.
 *  - Links externos (trailers, WhatsApp) abrem no navegador/app externo.
 */
public class PlayerActivity extends AppCompatActivity {

    private WebView webView;
    private ProgressBar progress;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_player);

        webView = findViewById(R.id.player_webview);
        progress = findViewById(R.id.player_progress);

        String videoUrl = getIntent().getStringExtra("video_url");
        String title = getIntent().getStringExtra("title");
        if (title != null && !title.isEmpty()) {
            setTitle(title);
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        webView.setWebViewClient(new PlayerWebViewClient());
        webView.setWebChromeClient(new PlayerWebChromeClient());

        if (videoUrl != null && !videoUrl.isEmpty()) {
            webView.loadUrl(videoUrl);
        } else {
            Toast.makeText(this, "V\u00eddeo indispon\u00edvel", Toast.LENGTH_SHORT).show();
            finish();
        }
    }

    private class PlayerWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleUrl(request.getUrl().toString());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleUrl(url);
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            progress.setVisibility(View.VISIBLE);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            progress.setVisibility(View.GONE);
        }
    }

    private class PlayerWebChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            if (newProgress >= 100) {
                progress.setVisibility(View.GONE);
            }
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
            WebView newWebView = new WebView(PlayerActivity.this);
            newWebView.getSettings().setJavaScriptEnabled(true);
            newWebView.getSettings().setDomStorageEnabled(true);
            newWebView.getSettings().setSupportMultipleWindows(true);
            newWebView.setWebViewClient(new PlayerWebViewClient());
            newWebView.setWebChromeClient(new PlayerWebChromeClient());
            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(newWebView);
            resultMsg.sendToTarget();
            return true;
        }
    }

    /** Roteia os links: WhatsApp nativo, externos no navegador, internos no player. */
    private boolean handleUrl(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();

        // WhatsApp: abre nativamente com n\u00famero e mensagem.
        if (isWhatsAppUrl(scheme, host, url)) {
            String mensagem = extrairMensagem(url);
            WhatsAppHelper.abrirWhatsApp(this, WhatsAppHelper.WHATSAPP_NUMBER, mensagem);
            return true;
        }

        // Player do StreamBetter: mant\u00e9m dentro do WebView.
        if (host.equals("streambetter.shop") || host.endsWith(".streambetter.shop")) {
            return false;
        }

        // Links externos (trailers, YouTube, outros): navegador externo.
        if (scheme.equals("http") || scheme.equals("https")) {
            WhatsAppHelper.abrirLinkExterno(this, url);
            return true;
        }

        // Outros schemes (mailto:, tel:, etc.).
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            // ignora
        }
        return true;
    }

    private boolean isWhatsAppUrl(String scheme, String host, String url) {
        if (scheme.equals("whatsapp")) return true;
        if (host.equals("wa.me") || host.endsWith(".wa.me")) return true;
        if (host.equals("api.whatsapp.com") || host.endsWith(".api.whatsapp.com")) return true;
        if (host.equals("wa.link") || host.endsWith(".wa.link")) return true;
        if (url.contains("whatsapp.com/send") || url.contains("wa.me/")) return true;
        return false;
    }

    private String extrairMensagem(String url) {
        try {
            Uri uri = Uri.parse(url);
            String text = uri.getQueryParameter("text");
            return text == null ? "" : text;
        } catch (Exception e) {
            return "";
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
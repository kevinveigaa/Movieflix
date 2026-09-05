package com.movieflix.app;

import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;

import java.util.ArrayList;
import java.util.List;

/**
 * Player de vídeo NATIVO do MovieFlix (ExoPlayer/Media3) — SEM WebView.
 *
 * Reproduz o vídeo diretamente do campo `videoUrl` do catálogo (mesma fonte
 * do site). Suporta HLS, DASH e MP4 progressivo.
 *
 * Recursos: play/pause, seek, fullscreen, volume (controles nativos do
 * PlayerView), seleção de qualidade/áudio/legendas (TrackSelector do Media3),
 * retomar de onde parou (SharedPreferences) e próximo episódio/autoplay.
 */
public class PlayerActivity extends AppCompatActivity {

    private static final String PREFS = "movieflix_playback";
    private static final String KEY_POS = "pos_";

    private ExoPlayer player;
    private PlayerView playerView;
    private ProgressBar progress;
    private String videoUrl;
    private String title;
    private String titleId;
    private boolean isSeries;
    private List<String> episodes = new ArrayList<>();

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_player);

        playerView = findViewById(R.id.player_view);
        progress = findViewById(R.id.player_progress);

        videoUrl = getIntent().getStringExtra("video_url");
        title = getIntent().getStringExtra("title");
        titleId = getIntent().getStringExtra("title_id");
        isSeries = getIntent().getBooleanExtra("is_series", false);
        String epsJson = getIntent().getStringExtra("episodes");
        if (epsJson != null && !epsJson.isEmpty()) {
            try {
                episodes = new Gson().fromJson(epsJson,
                        new TypeToken<List<String>>() {}.getType());
            } catch (Exception ignored) {}
        }

        if (title != null && !title.isEmpty()) setTitle(title);

        if (videoUrl == null || videoUrl.isEmpty()) {
            Toast.makeText(this, "Vídeo indisponível", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        setupPlayer();
    }

    private void setupPlayer() {
        HttpDataSource.Factory dataSourceFactory = new DefaultHttpDataSource.Factory()
                .setUserAgent("MovieFlix-Android/3.3")
                .setAllowCrossProtocolRedirects(true);

        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(this)
                        .setDataSourceFactory(dataSourceFactory))
                .build();

        playerView.setPlayer(player);
        playerView.setControllerShowTimeoutMs(3000);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);

        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_BUFFERING) {
                    progress.setVisibility(View.VISIBLE);
                } else {
                    progress.setVisibility(View.GONE);
                }
                if (state == Player.STATE_ENDED) {
                    salvarPosicao(0);
                    tocarProximoEpisodio();
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                progress.setVisibility(View.GONE);
                Toast.makeText(PlayerActivity.this,
                        "Erro ao reproduzir o vídeo. Tente novamente.", Toast.LENGTH_LONG).show();
            }
        });

        MediaItem mediaItem = MediaItem.fromUri(Uri.parse(videoUrl));
        player.setMediaItem(mediaItem);
        player.prepare();

        long pos = lerPosicao();
        if (pos > 0) player.seekTo(pos);
        player.setPlayWhenReady(true);
    }

    private String chavePosicao() {
        return KEY_POS + (titleId != null ? titleId : videoUrl);
    }

    private long lerPosicao() {
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        return sp.getLong(chavePosicao(), 0);
    }

    private void salvarPosicao(long pos) {
        SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
        sp.edit().putLong(chavePosicao(), pos).apply();
    }

    private String tmdbId() {
        try {
            Uri uri = Uri.parse(videoUrl);
            List<String> seg = uri.getPathSegments();
            if (seg.size() >= 2) return seg.get(1);
        } catch (Exception ignored) {}
        return "";
    }

    private void tocarProximoEpisodio() {
        if (!isSeries || episodes == null || episodes.isEmpty()) return;
        String atual = episodioAtual();
        int idx = episodes.indexOf(atual);
        if (idx >= 0 && idx + 1 < episodes.size()) {
            String prox = episodes.get(idx + 1);
            String[] partes = prox.split("/");
            if (partes.length == 2) {
                String url = "https://streambetter.shop/serie/" + tmdbId()
                        + "/" + partes[0] + "/" + partes[1] + "?lang=pt-BR";
                videoUrl = url;
                setupPlayer();
            }
        }
    }

    private String episodioAtual() {
        try {
            Uri uri = Uri.parse(videoUrl);
            List<String> seg = uri.getPathSegments();
            if (seg.size() >= 4) return seg.get(2) + "/" + seg.get(3);
        } catch (Exception ignored) {}
        return "";
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (player != null) {
            salvarPosicao(player.getCurrentPosition());
            player.setPlayWhenReady(false);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (player != null) player.setPlayWhenReady(true);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (player != null) {
            salvarPosicao(player.getCurrentPosition());
            player.release();
            player = null;
        }
    }
}
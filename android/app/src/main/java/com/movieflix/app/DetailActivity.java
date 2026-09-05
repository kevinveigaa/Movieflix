package com.movieflix.app;

import android.content.Intent;
import android.os.Bundle;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.bumptech.glide.Glide;
import com.google.gson.Gson;

/** Tela de detalhes de um título: pôster, descrição, assistir e contato. */
public class DetailActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_detail);

        String id = getIntent().getStringExtra("title_id");
        Title t = BackendClient.buscarPorId(id);
        if (t == null) {
            Toast.makeText(this, "Título não encontrado", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        ImageView poster = findViewById(R.id.detail_poster);
        TextView title = findViewById(R.id.detail_title);
        TextView meta = findViewById(R.id.detail_meta);
        TextView desc = findViewById(R.id.detail_desc);
        Button btnAssistir = findViewById(R.id.btn_assistir);
        Button btnContato = findViewById(R.id.btn_contato);

        if (t.posterUrl != null && !t.posterUrl.isEmpty()) {
            Glide.with(this).load(t.posterUrl).into(poster);
        }
        title.setText(t.title);
        String metaText = (t.year != null ? t.year : "")
                + (t.category != null && !t.category.isEmpty() ? "  •  " + t.category : "")
                + (t.quality != null && !t.quality.isEmpty() ? "  •  " + t.quality : "")
                + (t.language != null && !t.language.isEmpty() ? "  •  " + t.language : "");
        meta.setText(metaText.trim());
        desc.setText(t.description != null ? t.description : "");

        // Assistir: abre o player NATIVO (ExoPlayer) com a fonte do vídeo.
        btnAssistir.setOnClickListener(v -> {
            String streamUrl = t.getStreamUrl();
            if (streamUrl != null && !streamUrl.isEmpty()) {
                Intent i = new Intent(this, PlayerActivity.class);
                i.putExtra("video_url", streamUrl);
                i.putExtra("title", t.title);
                i.putExtra("title_id", t.id);
                i.putExtra("is_series", t.isSeries());
                if (t.eps != null && !t.eps.isEmpty()) {
                    i.putExtra("episodes", new Gson().toJson(t.eps));
                }
                startActivity(i);
            } else {
                Toast.makeText(this, "Vídeo indisponível", Toast.LENGTH_SHORT).show();
            }
        });

        // Contato via WhatsApp com mensagem pré-preenchida.
        btnContato.setOnClickListener(v -> WhatsAppHelper.abrirWhatsApp(this,
                "Olá! Gostaria de mais informações sobre o título \"" + t.title + "\" no MovieFlix."));
    }
}
package com.movieflix.app;

import android.os.Bundle;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;
import android.content.Intent;

import androidx.appcompat.app.AppCompatActivity;

import com.bumptech.glide.Glide;

/** Tela de detalhes de um título: pôster, descrição, assistir e contato. */
public class DetailActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_detail);

        String id = getIntent().getStringExtra("title_id");
        Title t = CatalogRepository.buscarPorId(id);
        if (t == null) {
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
                + (t.cat != null && !t.cat.isEmpty() ? "  •  " + t.cat : "")
                + (t.quality != null && !t.quality.isEmpty() ? "  •  " + t.quality : "");
        meta.setText(metaText.trim());
        desc.setText(t.desc != null ? t.desc : "");

        // Assistir: abre o player nativo dedicado (reproduz o vídeo corretamente).
        btnAssistir.setOnClickListener(v -> {
            if (t.videoUrl != null && !t.videoUrl.isEmpty()) {
                Intent i = new Intent(this, PlayerActivity.class);
                i.putExtra("video_url", t.videoUrl);
                i.putExtra("title", t.title);
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
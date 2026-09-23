package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.bumptech.glide.Glide
import java.util.concurrent.Executors

/**
 * HISTORICO — todos os registros de `watch_history` da conta/perfil ativo.
 * Cada item mostra o progresso real e permite retomar ou remover.
 */
class HistoryActivity : BaseTvActivity() {

    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var lista: LinearLayout
    private lateinit var vazio: TextView
    private lateinit var botaoLimpar: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        montarTela()
        carregar()
    }

    private fun montarTela() {
        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(resources.getDimensionPixelSize(R.dimen.content_pad), TvUi.dp(this@HistoryActivity, 24), resources.getDimensionPixelSize(R.dimen.content_pad), 0)
        }

        val topo = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val titulo = TvUi.texto(this, "HISTORICO", 26f, ContextCompat.getColor(this, R.color.mf_white), negrito = true)
        topo.addView(titulo, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

        botaoLimpar = TvUi.botao(this, "Limpar historico")
        botaoLimpar.setOnClickListener { confirmarLimpar() }
        topo.addView(botaoLimpar)
        raiz.addView(topo)

        vazio = TvUi.texto(this, "", 14f, ContextCompat.getColor(this, R.color.mf_gray), maxLinhas = 2)
        vazio.gravity = Gravity.CENTER
        vazio.setPadding(0, TvUi.dp(this, 40), 0, 0)
        raiz.addView(vazio)

        val scroll = ScrollView(this).apply { isVerticalScrollBarEnabled = false }
        lista = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, TvUi.dp(this@HistoryActivity, 16), 0, TvUi.dp(this@HistoryActivity, 30))
        }
        scroll.addView(lista)
        raiz.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        conteudo(raiz)
    }

    private fun carregar() {
        executor.execute {
            val registros = WatchHistoryRepository.listar(this)
            runOnUiThread { render(registros) }
        }
    }

    private fun render(registros: List<WatchHistoryRepository.Registro>) {
        lista.removeAllViews()
        // Registros com progresso irrecuperavel (posicao/duracao zeradas) nao entram.
        val validos = registros.filterNot {
            WatchHistoryRepository.ehProgressoLixo(it.positionSeconds, it.durationSeconds)
        }
        if (validos.isEmpty()) {
            vazio.visibility = View.VISIBLE
            vazio.text = "Nada no historico ainda.\nAssista a algo e ele aparece aqui."
            botaoLimpar.visibility = View.GONE
            return
        }
        vazio.visibility = View.GONE
        botaoLimpar.visibility = View.VISIBLE

        for (r in validos) {
            val linha = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                isFocusable = true
                setPadding(TvUi.dp(this@HistoryActivity, 16), TvUi.dp(this@HistoryActivity, 14), TvUi.dp(this@HistoryActivity, 16), TvUi.dp(this@HistoryActivity, 14))
            }
            linha.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = TvUi.dp(this@HistoryActivity, 8) }
            val normal = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_surface), 10, this, ContextCompat.getColor(this, R.color.mf_border), 1)
            val foco = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_surface_strong), 10, this, ContextCompat.getColor(this, R.color.mf_purple), 3)
            linha.background = normal
            linha.setOnFocusChangeListener { v, temFoco ->
                v.background = if (temFoco) foco else normal
                v.animate().scaleX(if (temFoco) 1.02f else 1f).scaleY(if (temFoco) 1.02f else 1f).setDuration(110).start()
            }

            val capa = android.widget.ImageView(this)
            val lpCapa = LinearLayout.LayoutParams(TvUi.dp(this, 66), TvUi.dp(this, 96))
            lpCapa.marginEnd = TvUi.dp(this, 16)
            capa.layoutParams = lpCapa
            capa.scaleType = android.widget.ImageView.ScaleType.CENTER_CROP
            capa.setBackgroundColor(ContextCompat.getColor(this, R.color.mf_surface_light))
            Glide.with(this).load(r.posterPath ?: "").placeholder(R.color.mf_surface_light).error(R.color.mf_surface_light).into(capa)
            linha.addView(capa)

            val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            val tit = TvUi.texto(this, r.title, 16f, ContextCompat.getColor(this, R.color.mf_white), negrito = true)
            col.addView(tit)
            val sub = TvUi.texto(
                this,
                MediaCatalog.rotuloEpisodio(r.season, r.episode).takeIf { it.isNotBlank() }?.plus("  •  ") ?: "" +
                    "${WatchHistoryRepository.progressoPercentual(r.positionSeconds, r.durationSeconds)}% assistido" +
                    if (WatchHistoryRepository.temProgressoReal(r.positionSeconds, r.durationSeconds)) "  •  Continuar" else "",
                13f, ContextCompat.getColor(this, R.color.mf_gray_light),
            )
            col.addView(sub)
            linha.addView(col, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

            val remover = TvUi.texto(this, "✕", 16f, ContextCompat.getColor(this, R.color.mf_gray_light), negrito = true)
            remover.isFocusable = true
            remover.setPadding(TvUi.dp(this, 14), TvUi.dp(this, 8), TvUi.dp(this, 14), TvUi.dp(this, 8))
            remover.setOnClickListener {
                executor.execute {
                    WatchHistoryRepository.remover(this, r.id)
                    runOnUiThread { carregar() }
                }
            }
            linha.addView(remover)

            linha.setOnClickListener { abrir(r) }
            lista.addView(linha)
        }
        lista.post { if (lista.childCount > 0) lista.getChildAt(0).requestFocus() }
    }

    private fun abrir(r: WatchHistoryRepository.Registro) {
        val t = r.tmdbId ?: return
        val m = CatalogRepository.porTmdb(this, t)
        if (m == null) { TvUi.aviso(this, "Titulo nao encontrado no catalogo."); return }
        val season = r.season
        val episode = r.episode
        val embed = MediaCatalog.embedUrl(m, season, episode)
        if (embed.isBlank()) { TvUi.aviso(this, "Sem fonte de video para este titulo."); return }
        startActivity(
            Intent(this, PlayerActivity::class.java)
                .putExtra("movie_id", m.id)
                .putExtra("embed_url", embed)
                .putExtra("season", season ?: -1)
                .putExtra("episode", episode ?: -1)
                .putExtra("posicao", r.positionSeconds),
        )
    }

    private fun confirmarLimpar() {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Limpar historico")
            .setMessage("Apagar TODO o historico de visualizacao desta conta?")
            .setPositiveButton("Apagar") { _, _ ->
                executor.execute {
                    WatchHistoryRepository.limparTudo(this)
                    runOnUiThread { carregar() }
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    override fun onResume() { super.onResume(); carregar() }

    override fun focoPadrao(): View? = if (::lista.isInitialized && lista.childCount > 0) lista.getChildAt(0) else botaoLimpar
}

package com.movieflix.tv

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.util.TypedValue
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.bitmap.RoundedCorners
import com.bumptech.glide.request.RequestOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Continuar assistindo — paridade com a seção do site/mobile.
 *
 * Fonte: tabela `watch_history` (a MESMA), filtrada pelo perfil ativo, com as
 * MESMAS regras de `watchProgress.ts`: só exibe progresso real (>= 10 min ou
 * >= 30% da duração) e nunca >= 95% (título concluído). Cada card retoma
 * exatamente do ponto salvo e abre o player direto.
 */
class HistoryActivity : SidebarHostActivity() {

    override val itemAtivo: String = "continuar"

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private lateinit var lista: RecyclerView
    private lateinit var lblInfo: TextView
    private val adapter = HistoryAdapter { item -> abrir(item) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Cabeçalho (título + estado) dentro da área de conteúdo
        val coluna = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(
            coluna,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        val cabecalho = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(
                MfDesign.dp(this@HistoryActivity, 26f),
                MfDesign.dp(this@HistoryActivity, 26f),
                MfDesign.dp(this@HistoryActivity, 26f),
                MfDesign.dp(this@HistoryActivity, 4f),
            )
        }
        cabecalho.addView(MfDesign.tituloTela(this, "Continuar assistindo"))
        lblInfo = MfDesign.texto(this, "").apply { textSize = 15f }
        cabecalho.addView(
            lblInfo,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@HistoryActivity, 8f) },
        )

        // Ação: limpar histórico
        val btnLimpar = TextView(this).apply {
            text = "Limpar histórico"
            background = resources.getDrawable(R.drawable.bg_pill_ghost, null)
            setTextColor(MfDesign.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            isFocusable = true
            isFocusableInTouchMode = true
            isClickable = true
            setPadding(
                MfDesign.dp(this@HistoryActivity, 24f), 0,
                MfDesign.dp(this@HistoryActivity, 24f), 0,
            )
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                MfDesign.dp(this@HistoryActivity, 46f),
            )
            MfDesign.focoBotao(this)
            setOnClickListener { limparHistorico() }
        }
        cabecalho.addView(
            btnLimpar,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@HistoryActivity, 16f) },
        )
        coluna.addView(cabecalho)

        lista = RecyclerView(this).apply {
            layoutManager = GridLayoutManager(
                this@HistoryActivity,
                MfMetrics.colunasHistorico(this@HistoryActivity),
            )
            adapter = this@HistoryActivity.adapter
            setHasFixedSize(true)
            clipToPadding = false
            itemAnimator = null
            setPadding(
                MfDesign.dp(this@HistoryActivity, 24f), MfDesign.dp(this@HistoryActivity, 12f),
                MfDesign.dp(this@HistoryActivity, 24f), MfDesign.dp(this@HistoryActivity, 30f),
            )
        }
        coluna.addView(
            lista,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f,
            ),
        )

        carregar()
    }

    private fun carregar() {
        if (!AuthRepository.estaLogado(this)) {
            lblInfo.text = "Entre com a sua conta MovieFlix para ver o que você já assistiu."
            lblInfo.setTextColor(MfDesign.GOLD)
            return
        }
        scope.launch {
            val registros = withContext(Dispatchers.IO) {
                WatchHistoryRepository.listar(this@HistoryActivity)
                    .filter {
                        WatchHistoryRepository.temProgressoReal(it.positionSeconds, it.durationSeconds) &&
                            !WatchHistoryRepository.ehProgressoLixo(it.positionSeconds, it.durationSeconds)
                    }
            }
            adapter.submit(registros)
            lblInfo.text = if (registros.isEmpty()) {
                "Nada em andamento ainda. Comece a assistir e o progresso aparece aqui — o mesmo do site e do app do celular."
            } else {
                "${registros.size} título(s) em andamento • o mesmo progresso do site e do celular."
            }
            if (registros.isNotEmpty()) lista.requestFocus()
        }
    }

    private fun limparHistorico() {
        scope.launch {
            val ok = withContext(Dispatchers.IO) { WatchHistoryRepository.limparTudo(this@HistoryActivity) }
            if (ok) {
                adapter.submit(emptyList())
                lblInfo.text = "Seu histórico foi limpo."
            }
        }
    }

    private fun abrir(item: WatchHistoryRepository.Registro) {
        scope.launch {
            val catalogo = withContext(Dispatchers.IO) { CatalogRepository.all(this@HistoryActivity) }
            val movie = catalogo.firstOrNull { (it.tmdbIdNumerico ?: -1L) == item.tmdbId }
            if (movie != null) {
                startActivity(
                    Intent(this@HistoryActivity, PlaybackActivity::class.java)
                        .putExtra("movie_id", movie.id)
                        .putExtra("season", item.season ?: 1)
                        .putExtra("episode", item.episode ?: 1),
                )
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}

/**
 * Grade de "continuar assistindo": cards 16:9 grandes com barra de progresso
 * em gradiente e foco D-pad bem visível.
 */
class HistoryAdapter(
    private val onOpen: (WatchHistoryRepository.Registro) -> Unit,
) : RecyclerView.Adapter<HistoryAdapter.VH>() {

    private val items = mutableListOf<WatchHistoryRepository.Registro>()

    fun submit(list: List<WatchHistoryRepository.Registro>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
        VH(HistoryCardView(parent.context))

    override fun onBindViewHolder(holder: VH, position: Int) =
        (holder.itemView as HistoryCardView).bind(items[position]) { onOpen(items[position]) }

    override fun getItemCount(): Int = items.size

    class VH(view: View) : RecyclerView.ViewHolder(view)

    /** Card largo (16:9) com backdrop, título, meta e barra de progresso. */
    class HistoryCardView(context: android.content.Context) : LinearLayout(context) {

        private val arte = ImageView(context)
        private val scrim = View(context)
        private val barraTrilha = View(context)
        private val barraFill = View(context)
        private val seloContinuar: TextView
        private val titulo: TextView
        private val meta: TextView

        init {
            orientation = VERTICAL
            setPadding(
                MfDesign.dp(context, 10f), MfDesign.dp(context, 10f),
                MfDesign.dp(context, 10f), MfDesign.dp(context, 14f),
            )
            isFocusable = true
            isFocusableInTouchMode = true
            isClickable = true
            background = resources.getDrawable(R.drawable.bg_focus, null)
            layoutParams = RecyclerView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply {
                val margem = MfDesign.dp(context, 8f)
                setMargins(margem, margem, margem, margem)
            }

            // Arte 16:9
            val moldura = FrameLayout(context)
            arte.scaleType = ImageView.ScaleType.CENTER_CROP
            arte.background = resources.getDrawable(R.drawable.bg_poster_placeholder, null)
            moldura.addView(
                arte,
                FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT),
            )
            scrim.setBackgroundResource(R.drawable.bg_card_overlay)
            moldura.addView(
                scrim,
                FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, MfDesign.dp(context, 90f)).apply {
                    gravity = Gravity.BOTTOM
                },
            )

            // Barra de progresso (trilha + preenchimento em gradiente)
            barraTrilha.setBackgroundResource(R.drawable.progress_track)
            moldura.addView(
                barraTrilha,
                FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, MfDesign.dp(context, 5f)).apply {
                    gravity = Gravity.BOTTOM
                    marginStart = MfDesign.dp(context, 4f)
                    marginEnd = MfDesign.dp(context, 4f)
                    bottomMargin = MfDesign.dp(context, 4f)
                },
            )
            barraFill.setBackgroundResource(R.drawable.progress_fill)
            moldura.addView(
                barraFill,
                FrameLayout.LayoutParams(MfDesign.dp(context, 6f), MfDesign.dp(context, 5f)).apply {
                    gravity = Gravity.BOTTOM or Gravity.START
                    marginStart = MfDesign.dp(context, 4f)
                    bottomMargin = MfDesign.dp(context, 4f)
                },
            )
            addView(moldura, LayoutParams(LayoutParams.MATCH_PARENT, MfDesign.dp(context, 132f)))

            // Selo "CONTINUAR"
            seloContinuar = MfDesign.selo(context, "▶  CONTINUAR", MfDesign.TEAL, MfDesign.WHITE, 6f)
            moldura.addView(
                seloContinuar,
                FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT).apply {
                    gravity = Gravity.TOP or Gravity.START
                    topMargin = MfDesign.dp(context, 8f)
                    marginStart = MfDesign.dp(context, 8f)
                },
            )

            titulo = TextView(context).apply {
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
                typeface = Typeface.DEFAULT_BOLD
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
            }
            addView(
                titulo,
                LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                    topMargin = MfDesign.dp(context, 10f)
                },
            )

            meta = TextView(context).apply {
                setTextColor(MfDesign.GRAY)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                maxLines = 1
            }
            addView(
                meta,
                LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                    topMargin = MfDesign.dp(context, 4f)
                },
            )

            setOnFocusChangeListener { v, temFoco ->
                v.animate().scaleX(if (temFoco) 1.04f else 1f)
                    .scaleY(if (temFoco) 1.04f else 1f)
                    .setDuration(140).start()
            }
        }

        fun bind(r: WatchHistoryRepository.Registro, onClick: () -> Unit) {
            titulo.text = r.title.ifBlank { "Título" }
            val rotuloEp = MediaCatalog.rotuloEpisodio(r.season, r.episode)
            val pct = WatchHistoryRepository.progressoPercentual(r.positionSeconds, r.durationSeconds)
            val tipo = if (r.mediaType == "tv") "Série" else "Filme"
            val partes = mutableListOf(tipo)
            if (rotuloEp.isNotBlank()) partes.add(rotuloEp)
            partes.add("$pct% assistido")
            meta.text = partes.joinToString("  •  ")

            val url = r.backdropPath ?: r.posterPath
            if (!url.isNullOrBlank()) {
                Glide.with(context)
                    .load(url)
                    .apply(
                        RequestOptions()
                            .transform(RoundedCorners(MfDesign.dp(context, 10f)))
                            .placeholder(ColorDrawable(MfDesign.SURFACE_LIGHT))
                            .error(ColorDrawable(MfDesign.SURFACE_STRONG))
                            .centerCrop(),
                    )
                    .into(arte)
            } else {
                arte.setImageDrawable(ColorDrawable(MfDesign.SURFACE_STRONG))
            }

            // Preenchimento proporcional ao progresso real (medido após o layout)
            barraFill.post {
                val pai = barraFill.parent as? View ?: return@post
                val largura = (pai.width * (pct.coerceIn(0, 100) / 100f)).toInt()
                barraFill.layoutParams = FrameLayout.LayoutParams(
                    largura.coerceAtLeast(MfDesign.dp(context, 6f)),
                    MfDesign.dp(context, 5f),
                ).apply {
                    gravity = Gravity.BOTTOM or Gravity.START
                    marginStart = MfDesign.dp(context, 4f)
                    bottomMargin = MfDesign.dp(context, 4f)
                }
            }

            setOnClickListener { onClick() }
        }
    }
}

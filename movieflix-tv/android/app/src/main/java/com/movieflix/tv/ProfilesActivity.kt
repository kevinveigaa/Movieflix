package com.movieflix.tv

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.util.TypedValue
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Perfis de exibição ("Quem está assistindo?") — paridade com o site/mobile.
 *
 * Regras preservadas:
 *  - perfis vivem em `viewer_profiles` (owner_id = usuário logado);
 *  - o limite de perfis é o do PLANO (1 sem assinatura; conforme o plano);
 *  - o perfil escolhido é memorizado e filtra favoritos/histórico;
 *  - ao final, entra na Home com o perfil ativo.
 *
 * Interface reconstruída para TV: cards grandes com avatar em gradiente,
 * foco D-pad evidente e ações de gerenciar/criar/renomear/excluir.
 */
class ProfilesActivity : SidebarHostActivity() {

    override val itemAtivo: String = "perfis"

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private lateinit var adapter: ProfileAdapter
    private lateinit var lblInfo: TextView
    private lateinit var btnNovo: TextView

    private var perfis: List<ProfilesRepository.Perfil> = emptyList()
    private var maxPerfis = 1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(
                MfDesign.dp(this@ProfilesActivity, 40f),
                MfDesign.dp(this@ProfilesActivity, 30f),
                MfDesign.dp(this@ProfilesActivity, 40f),
                MfDesign.dp(this@ProfilesActivity, 24f),
            )
        }
        content.addView(
            raiz,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        raiz.addView(MfDesign.tituloTela(this, "Quem está assistindo?"))
        lblInfo = MfDesign.texto(this, "").apply { textSize = 15f }
        raiz.addView(
            lblInfo,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@ProfilesActivity, 6f) },
        )

        val lista = RecyclerView(this).apply {
            layoutManager = GridLayoutManager(this@ProfilesActivity, 5)
            clipToPadding = false
            itemAnimator = null
            setPadding(0, MfDesign.dp(this@ProfilesActivity, 18f), 0, 0)
        }
        adapter = ProfileAdapter(
            onSelect = { selecionar(it) },
            onEdit = { editar(it) },
        )
        lista.adapter = adapter
        raiz.addView(
            lista,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f,
            ),
        )

        val linhaAcoes = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        btnNovo = botao("+  Novo perfil", R.drawable.bg_pill_secondary) { criarPerfil() }
        val btnContinuar = botao("Continuar", R.drawable.bg_pill_primary) { irParaHome() }
        linhaAcoes.addView(btnNovo)
        linhaAcoes.addView(
            btnContinuar,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                MfDesign.dp(this@ProfilesActivity, 52f),
            ).apply { marginStart = MfDesign.dp(this@ProfilesActivity, 12f) },
        )
        raiz.addView(
            linhaAcoes,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@ProfilesActivity, 14f) },
        )

        carregar()
    }

    private fun botao(texto: String, fundo: Int, acao: () -> Unit): TextView =
        TextView(this).apply {
            text = texto
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            isFocusable = true
            isFocusableInTouchMode = true
            isClickable = true
            setPadding(
                MfDesign.dp(this@ProfilesActivity, 28f), 0,
                MfDesign.dp(this@ProfilesActivity, 28f), 0,
            )
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                MfDesign.dp(this@ProfilesActivity, 52f),
            )
            background = resources.getDrawable(fundo, null)
            MfDesign.focoBotao(this)
            setOnClickListener { acao() }
        }

    private fun carregar() {
        if (!AuthRepository.estaLogado(this)) {
            Toast.makeText(this, "Entre com a sua conta primeiro.", Toast.LENGTH_LONG).show()
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        scope.launch {
            val (lista, limite) = withContext(Dispatchers.IO) {
                val assinatura = AccountRepository.assinatura(this@ProfilesActivity)
                val ativa = AccountRepository.temAssinaturaAtiva(assinatura)
                val planos = AccountRepository.planos(this@ProfilesActivity)
                val ent = PlanoRegras.entitlementsForSubscription(assinatura, ativa, planos)
                ProfilesRepository.listar(this@ProfilesActivity) to ent.maxProfiles
            }
            perfis = lista
            maxPerfis = limite

            // Sem perfis ainda → cria um perfil padrão (mesma regra do site).
            if (perfis.isEmpty()) {
                val base = AuthRepository.loadEmail(this@ProfilesActivity)?.substringBefore("@") ?: "Perfil 1"
                val novo = withContext(Dispatchers.IO) {
                    ProfilesRepository.criar(this@ProfilesActivity, base, "", false)
                }
                if (novo != null) perfis = listOf(novo)
            }

            adapter.submit(perfis)
            atualizarInfo()
            if (perfis.size == 1 && ProfilesRepository.perfilAtivo(this@ProfilesActivity) == null) {
                ProfilesRepository.setPerfilAtivo(this@ProfilesActivity, perfis.first())
            }
        }
    }

    private fun atualizarInfo() {
        val ativo = ProfilesRepository.perfilAtivo(this)
        val usados = perfis.size
        val limite = if (maxPerfis >= PlanoRegras.UNLIMITED) "ilimitado" else maxPerfis.toString()
        val atual = ativo?.name?.let { "  •  Ativo: $it" } ?: ""
        lblInfo.text = "Perfis: $usados/$limite$atual  •  o limite vem do seu plano."
        btnNovo.isEnabled = usados < maxPerfis
        btnNovo.alpha = if (btnNovo.isEnabled) 1f else 0.45f
    }

    private fun selecionar(p: ProfilesRepository.Perfil) {
        ProfilesRepository.setPerfilAtivo(this, p)
        atualizarInfo()
        irParaHome()
    }

    private fun irParaHome() {
        startActivity(
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        )
        finish()
    }

    private fun criarPerfil() {
        if (perfis.size >= maxPerfis) {
            Toast.makeText(
                this,
                "Seu plano permite $maxPerfis perfil(is). Assine um plano maior para adicionar mais.",
                Toast.LENGTH_LONG,
            ).show()
            return
        }
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT
            hint = "Nome do perfil"
            setTextColor(Color.WHITE)
            setHintTextColor(MfDesign.GRAY)
        }
        AlertDialog.Builder(this)
            .setTitle("Novo perfil")
            .setView(input)
            .setPositiveButton("CRIAR") { _, _ ->
                val nome = input.text.toString().ifBlank { "Perfil ${perfis.size + 1}" }
                scope.launch {
                    val novo = withContext(Dispatchers.IO) {
                        ProfilesRepository.criar(this@ProfilesActivity, nome, "", false)
                    }
                    if (novo != null) {
                        perfis = perfis + novo
                        adapter.submit(perfis)
                        atualizarInfo()
                    } else {
                        Toast.makeText(this@ProfilesActivity, "Não foi possível criar o perfil.", Toast.LENGTH_LONG).show()
                    }
                }
            }
            .setNegativeButton("CANCELAR", null)
            .show()
    }

    private fun editar(p: ProfilesRepository.Perfil) {
        AlertDialog.Builder(this)
            .setTitle(p.name)
            .setItems(arrayOf("Renomear", "Excluir perfil")) { _, which ->
                if (which == 0) renomear(p) else excluir(p)
            }
            .show()
    }

    private fun renomear(p: ProfilesRepository.Perfil) {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT
            setText(p.name)
            setTextColor(Color.WHITE)
            setHintTextColor(MfDesign.GRAY)
        }
        AlertDialog.Builder(this)
            .setTitle("Renomear perfil")
            .setView(input)
            .setPositiveButton("SALVAR") { _, _ ->
                val nome = input.text.toString().ifBlank { p.name }
                scope.launch {
                    val ok = withContext(Dispatchers.IO) {
                        ProfilesRepository.atualizar(this@ProfilesActivity, p.id, nome, p.avatarUrl, p.isKid)
                    }
                    if (ok) {
                        perfis = perfis.map { if (it.id == p.id) it.copy(name = nome) else it }
                        adapter.submit(perfis)
                        if (ProfilesRepository.perfilAtivoId(this@ProfilesActivity) == p.id) {
                            ProfilesRepository.setPerfilAtivo(this@ProfilesActivity, p.copy(name = nome))
                        }
                        atualizarInfo()
                    }
                }
            }
            .setNegativeButton("CANCELAR", null)
            .show()
    }

    private fun excluir(p: ProfilesRepository.Perfil) {
        if (perfis.size <= 1) {
            Toast.makeText(this, "É preciso manter ao menos 1 perfil.", Toast.LENGTH_LONG).show()
            return
        }
        AlertDialog.Builder(this)
            .setTitle("Excluir \u201C${p.name}\u201D?")
            .setMessage("O histórico e os favoritos deste perfil deixam de aparecer na TV.")
            .setPositiveButton("EXCLUIR") { _, _ ->
                scope.launch {
                    val ok = withContext(Dispatchers.IO) { ProfilesRepository.remover(this@ProfilesActivity, p.id) }
                    if (ok) {
                        perfis = perfis.filterNot { it.id == p.id }
                        adapter.submit(perfis)
                        if (ProfilesRepository.perfilAtivoId(this@ProfilesActivity) == p.id) {
                            ProfilesRepository.setPerfilAtivo(this@ProfilesActivity, perfis.firstOrNull())
                        }
                        atualizarInfo()
                    } else {
                        Toast.makeText(this@ProfilesActivity, "Não foi possível excluir.", Toast.LENGTH_LONG).show()
                    }
                }
            }
            .setNegativeButton("CANCELAR", null)
            .show()
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}

/** Grade de perfis com avatar em gradiente e foco D-pad destacado. */
class ProfileAdapter(
    private val onSelect: (ProfilesRepository.Perfil) -> Unit,
    private val onEdit: (ProfilesRepository.Perfil) -> Unit,
) : RecyclerView.Adapter<ProfileAdapter.VH>() {

    private val items = mutableListOf<ProfilesRepository.Perfil>()

    fun submit(list: List<ProfilesRepository.Perfil>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val ctx = parent.context
        val card = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            isFocusable = true
            isFocusableInTouchMode = true
            isClickable = true
            setPadding(
                MfDesign.dp(ctx, 14f), MfDesign.dp(ctx, 16f),
                MfDesign.dp(ctx, 14f), MfDesign.dp(ctx, 14f),
            )
            background = fundoPerfil(ctx, false)
            layoutParams = RecyclerView.LayoutParams(
                MfDesign.dp(ctx, 210f),
                RecyclerView.LayoutParams.WRAP_CONTENT,
            ).apply {
                val m = MfDesign.dp(ctx, 10f)
                setMargins(m, m, m, m)
            }
        }
        return VH(card)
    }

    override fun onBindViewHolder(holder: VH, position: Int) = holder.bind(items[position])

    override fun getItemCount(): Int = items.size

    inner class VH(private val card: LinearLayout) : RecyclerView.ViewHolder(card) {

        private val ctx = card.context
        private val avatar = ImageView(ctx)
        private val inicial = TextView(ctx)
        private val nome = TextView(ctx)
        private val btnGer = TextView(ctx)

        init {
            val moldura = FrameLayout(ctx)
            avatar.scaleType = ImageView.ScaleType.CENTER_CROP
            avatar.visibility = View.GONE
            moldura.addView(
                avatar,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                ),
            )
            inicial.apply {
                gravity = Gravity.CENTER
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 42f)
                typeface = Typeface.DEFAULT_BOLD
                background = MfDesign.gradientePrimario(MfDesign.dp(ctx, 70f).toFloat())
            }
            moldura.addView(
                inicial,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                ),
            )
            card.addView(
                moldura,
                LinearLayout.LayoutParams(
                    MfDesign.dp(ctx, 118f),
                    MfDesign.dp(ctx, 118f),
                ),
            )

            nome.apply {
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
            }
            card.addView(
                nome,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = MfDesign.dp(ctx, 12f) },
            )

            btnGer.apply {
                text = "Gerenciar"
                setTextColor(MfDesign.GRAY_LIGHT)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                gravity = Gravity.CENTER
                isFocusable = true
                isFocusableInTouchMode = true
                isClickable = true
                setPadding(
                    MfDesign.dp(ctx, 14f), MfDesign.dp(ctx, 5f),
                    MfDesign.dp(ctx, 14f), MfDesign.dp(ctx, 5f),
                )
                background = GradientDrawable().apply {
                    cornerRadius = MfDesign.dp(ctx, 16f).toFloat()
                    setColor(MfDesign.SURFACE_STRONG)
                }
            }
            card.addView(
                btnGer,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = MfDesign.dp(ctx, 10f) },
            )

            card.setOnFocusChangeListener { v, temFoco ->
                v.background = fundoPerfil(ctx, temFoco)
                v.animate().scaleX(if (temFoco) 1.05f else 1f)
                    .scaleY(if (temFoco) 1.05f else 1f).setDuration(140).start()
            }
        }

        fun bind(p: ProfilesRepository.Perfil) {
            nome.text = p.name
            inicial.text = p.name.take(1).uppercase()
            if (p.avatarUrl.isNotBlank()) {
                avatar.visibility = View.VISIBLE
                inicial.visibility = View.GONE
                Glide.with(ctx)
                    .load(p.avatarUrl)
                    .placeholder(ColorDrawable(MfDesign.SURFACE_LIGHT))
                    .into(avatar)
            } else {
                avatar.visibility = View.GONE
                inicial.visibility = View.VISIBLE
            }
            card.setOnClickListener { onSelect(p) }
            btnGer.setOnClickListener { onEdit(p) }
        }
    }

    private fun fundoPerfil(ctx: android.content.Context, focado: Boolean): GradientDrawable =
        GradientDrawable().apply {
            cornerRadius = MfDesign.dp(ctx, 16f).toFloat()
            setColor(if (focado) MfDesign.SURFACE_STRONG else MfDesign.SURFACE_LIGHT)
            setStroke(
                MfDesign.dp(ctx, if (focado) 3f else 1f),
                if (focado) MfDesign.PURPLE else MfDesign.BORDER,
            )
        }
}

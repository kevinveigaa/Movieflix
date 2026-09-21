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

    /**
     * Diálogo de texto com o TECLADO EM TELA do app (MfKeyboard).
     *
     * ── CORREÇÃO v2.0.1 ─────────────────────────────────────────────────────
     * Antes estes diálogos usavam `EditText` cru, contando com o teclado
     * virtual do Android — que em TV Box / Android TV frequentemente não abre
     * pelo controle remoto. Agora o nome do perfil é digitado com o mesmo
     * teclado navegável por D-pad do resto do app.
     */
    private fun dialogoComTeclado(
        titulo: String,
        valorInicial: String,
        rotuloOk: String,
        aoConfirmar: (String) -> Unit,
    ) {
        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(
                MfDesign.dp(this@ProfilesActivity, 18f),
                MfDesign.dp(this@ProfilesActivity, 10f),
                MfDesign.dp(this@ProfilesActivity, 18f),
                MfDesign.dp(this@ProfilesActivity, 12f),
            )
        }

        val campo = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT
            hint = "Nome do perfil"
            setText(valorInicial)
            setSelection(valorInicial.length)
            setTextColor(Color.WHITE)
            setHintTextColor(MfDesign.GRAY)
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
            showSoftInputOnFocus = false
            background = resources.getDrawable(R.drawable.bg_input, null)
            setPadding(
                MfDesign.dp(this@ProfilesActivity, 20f), 0,
                MfDesign.dp(this@ProfilesActivity, 20f), 0,
            )
        }
        raiz.addView(
            campo,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                MfDesign.dp(this@ProfilesActivity, 56f),
            ),
        )

        val teclado = MfKeyboard(this).apply {
            rotuloConfirmar = rotuloOk
            definirAlvo(campo)
            acima = campo
        }
        raiz.addView(
            teclado,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@ProfilesActivity, 10f) },
        )

        val dialog = AlertDialog.Builder(this)
            .setTitle(titulo)
            .setView(raiz)
            .setPositiveButton(rotuloOk, null)
            .setNegativeButton("CANCELAR", null)
            .create()

        // A tecla de confirmação do teclado e o botão do diálogo fazem o mesmo.
        teclado.aoConfirmar = {
            aoConfirmar(campo.text.toString())
            dialog.dismiss()
        }
        dialog.setOnShowListener {
            dialog.getButton(android.content.DialogInterface.BUTTON_POSITIVE)
                .setOnClickListener {
                    aoConfirmar(campo.text.toString())
                    dialog.dismiss()
                }
        }

        // OK no campo foca a primeira tecla do teclado em tela.
        campo.setOnClickListener { teclado.focarPrimeira() }

        dialog.show()
        // Em TV o diálogo precisa de largura confortável para o teclado.
        dialog.window?.setLayout(
            MfDesign.dp(this@ProfilesActivity, 820f),
            ViewGroup.LayoutParams.WRAP_CONTENT,
        )
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
                    // Avatar do MESMO conjunto do site/mobile (a TV mostra em PNG).
                    ProfilesRepository.criar(
                        this@ProfilesActivity, base, ProfilesRepository.AVATARES.first(), false,
                    )
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
        dialogoComTeclado(
            titulo = "Novo perfil",
            valorInicial = "",
            rotuloOk = "CRIAR",
        ) { digitado ->
            val nome = digitado.ifBlank { "Perfil ${perfis.size + 1}" }
            scope.launch {
                val avatar = ProfilesRepository.AVATARES[perfis.size % ProfilesRepository.AVATARES.size]
                val novo = withContext(Dispatchers.IO) {
                    ProfilesRepository.criar(this@ProfilesActivity, nome, avatar, false)
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
    }

    private fun editar(p: ProfilesRepository.Perfil) {
        AlertDialog.Builder(this)
            .setTitle(p.name)
            .setItems(arrayOf("Trocar avatar", "Renomear", "Excluir perfil")) { _, which ->
                when (which) {
                    0 -> escolherAvatar(p)
                    1 -> renomear(p)
                    else -> excluir(p)
                }
            }
            .show()
    }

    /**
     * Troca de avatar usando o MESMO conjunto de avatares do site/mobile
     * (`src/lib/avatars.ts`) — sem inventar imagens novas.
     */
    private fun escolherAvatar(p: ProfilesRepository.Perfil) {
        val grade = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(
                MfDesign.dp(this@ProfilesActivity, 16f), MfDesign.dp(this@ProfilesActivity, 8f),
                MfDesign.dp(this@ProfilesActivity, 16f), MfDesign.dp(this@ProfilesActivity, 8f),
            )
        }
        var linha: LinearLayout? = null
        ProfilesRepository.AVATARES.forEachIndexed { i, url ->
            if (i % 4 == 0) {
                linha = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                grade.addView(linha)
            }
            val img = ImageView(this).apply {
                isFocusable = true
                isFocusableInTouchMode = true
                isClickable = true
                background = resources.getDrawable(R.drawable.bg_pill_secondary, null)
                setPadding(
                    MfDesign.dp(this@ProfilesActivity, 6f), MfDesign.dp(this@ProfilesActivity, 6f),
                    MfDesign.dp(this@ProfilesActivity, 6f), MfDesign.dp(this@ProfilesActivity, 6f),
                )
            }
            Glide.with(this)
                .load(ProfilesRepository.avatarRenderizavel(url))
                .placeholder(ColorDrawable(MfDesign.SURFACE_LIGHT))
                .into(img)
            imagemFoco(img)
            linha?.addView(
                img,
                LinearLayout.LayoutParams(
                    MfDesign.dp(this, 96f),
                    MfDesign.dp(this, 96f),
                ).apply {
                    val m = MfDesign.dp(this@ProfilesActivity, 6f)
                    setMargins(m, m, m, m)
                },
            )
        }

        val dialog = AlertDialog.Builder(this)
            .setTitle("Escolha um avatar para ${p.name}")
            .setView(grade)
            .setNegativeButton("CANCELAR", null)
            .create()

        fun aplicar(url: String) {
            scope.launch {
                val ok = withContext(Dispatchers.IO) {
                    ProfilesRepository.atualizar(this@ProfilesActivity, p.id, p.name, url, p.isKid)
                }
                if (ok) {
                    perfis = perfis.map { if (it.id == p.id) it.copy(avatarUrl = url) else it }
                    adapter.submit(perfis)
                    if (ProfilesRepository.perfilAtivoId(this@ProfilesActivity) == p.id) {
                        ProfilesRepository.setPerfilAtivo(
                            this@ProfilesActivity, p.copy(avatarUrl = url),
                        )
                    }
                }
                dialog.dismiss()
            }
        }

        dialog.show()
        dialog.window?.setLayout(
            MfDesign.dp(this, 720f),
            android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
        )
        // Liga o clique depois de exibir (as imagens já estão na árvore)
        var idx = 0
        for (i in 0 until grade.childCount) {
            val l = grade.getChildAt(i) as? LinearLayout ?: continue
            for (j in 0 until l.childCount) {
                val v = l.getChildAt(j)
                val url = ProfilesRepository.AVATARES.getOrNull(idx++) ?: continue
                v.setOnClickListener { aplicar(url) }
            }
        }
    }

    /** Realce de foco para imagens clicáveis (avatar). */
    private fun imagemFoco(v: View) {
        v.setOnFocusChangeListener { _, temFoco ->
            v.animate().scaleX(if (temFoco) 1.08f else 1f)
                .scaleY(if (temFoco) 1.08f else 1f).setDuration(120).start()
            v.alpha = if (temFoco) 1f else 0.8f
        }
    }

    private fun renomear(p: ProfilesRepository.Perfil) {
        dialogoComTeclado(
            titulo = "Renomear perfil",
            valorInicial = p.name,
            rotuloOk = "SALVAR",
        ) { digitado ->
            val nome = digitado.ifBlank { p.name }
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
                    .load(ProfilesRepository.avatarRenderizavel(p.avatarUrl))
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

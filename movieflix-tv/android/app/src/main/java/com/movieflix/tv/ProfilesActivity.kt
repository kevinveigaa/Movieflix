package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.bumptech.glide.Glide
import java.util.concurrent.Executors

/**
 * Escolha de pefil (`viewer_profiles`) — mesmos perfis da conta do site.
 * Limite aplicado conforme o plano (PlanoRegras).
 */
class ProfilesActivity : BaseTvActivity() {

    private lateinit var linhaPerfis: LinearLayout
    private lateinit var aviso: TextView
    private val executor = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        montarTela()
        carregar()
    }

    private fun montarTela() {
        val coluna = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(TvUi.dp(this@ProfilesActivity, 60), TvUi.dp(this@ProfilesActivity, 30), TvUi.dp(this@ProfilesActivity, 60), TvUi.dp(this@ProfilesActivity, 30))
        }

        val titulo = TvUi.texto(this, "Quem esta assistindo?", 30f, ContextCompat.getColor(this, R.color.mf_white), negrito = true)
        coluna.addView(titulo)

        aviso = TvUi.texto(this, "", 13f, ContextCompat.getColor(this, R.color.mf_gray), maxLinhas = 2)
        aviso.gravity = Gravity.CENTER
        coluna.addView(aviso, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = TvUi.dp(this@ProfilesActivity, 8) })

        val scroll = android.widget.HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        linhaPerfis = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, TvUi.dp(this@ProfilesActivity, 26), 0, TvUi.dp(this@ProfilesActivity, 26))
        }
        scroll.addView(linhaPerfis)
        coluna.addView(scroll)

        val sair = TvUi.botao(this, "Sair da conta")
        sair.setOnClickListener {
            AuthRepository.clearSession(this)
            ProfilesRepository.setPerfilAtivo(this, null)
            startActivity(Intent(this, LoginActivity::class.java)); finish()
        }
        coluna.addView(sair, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = TvUi.dp(this@ProfilesActivity, 10); gravity = Gravity.CENTER_HORIZONTAL
        })

        conteudo(coluna)
    }

    private fun carregar() {
        executor.execute {
            val perfis = ProfilesRepository.listar(this)
            val planos = AccountRepository.planos(this)
            val assinatura = AccountRepository.assinatura(this)
            val ativa = AccountRepository.temAssinaturaAtiva(assinatura)
            val limite = PlanoRegras.entitlementsForSubscription(assinatura, ativa, planos).maxProfiles
            runOnUiThread { render(perfis, limite) }
        }
    }

    private fun render(perfis: List<ProfilesRepository.Perfil>, limite: Int) {
        linhaPerfis.removeAllViews()
        val podeAdicionar = perfis.size < limite
        aviso.text = "Plano atual permite ate $limite perfil(is)" + if (limite <= 1) " — assine um plano maior para criar mais" else ""

        for (p in perfis) {
            linhaPerfis.addView(cartaoPerfil(p))
        }
        if (podeAdicionar) {
            linhaPerfis.addView(cartaoAdicionar())
        }
        linhaPerfis.post {
            if (linhaPerfis.childCount > 0) linhaPerfis.getChildAt(0).requestFocus()
        }
    }

    private fun cartaoPerfil(p: ProfilesRepository.Perfil): android.view.View {
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            isFocusable = true
            setPadding(TvUi.dp(this@ProfilesActivity, 14), TvUi.dp(this@ProfilesActivity, 14), TvUi.dp(this@ProfilesActivity, 14), TvUi.dp(this@ProfilesActivity, 14))
        }
        val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        lp.marginEnd = TvUi.dp(this, 26)
        col.layoutParams = lp

        val fundoNormal = TvUi.fundo(0x00000000, 14, this)
        val fundoFoco = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_surface_strong), 14, this, ContextCompat.getColor(this, R.color.mf_red), 3)
        col.background = fundoNormal
        col.setOnFocusChangeListener { v, temFoco ->
            v.background = if (temFoco) fundoFoco else fundoNormal
            v.animate().scaleX(if (temFoco) 1.08f else 1f).scaleY(if (temFoco) 1.08f else 1f).setDuration(120).start()
        }

        val img = ImageView(this)
        val lado = TvUi.dp(this, 118)
        img.layoutParams = LinearLayout.LayoutParams(lado, lado)
        img.setBackgroundColor(ContextCompat.getColor(this, R.color.mf_surface_light))
        Glide.with(this).load(ProfilesRepository.avatarRenderizavel(p.avatarUrl)).placeholder(R.color.mf_surface_light).error(R.color.mf_surface_light).circleCrop().into(img)
        col.addView(img)

        val nome = TvUi.texto(this, p.name + if (p.isKid) "  ★" else "", 15f, ContextCompat.getColor(this, R.color.mf_white), negrito = true)
        col.addView(nome, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = TvUi.dp(this@ProfilesActivity, 10) })

        col.setOnClickListener { selecionar(p) }
        col.setOnLongClickListener { confirmarRemover(p); true }
        return col
    }

    private fun cartaoAdicionar(): android.view.View {
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            isFocusable = true
            setPadding(TvUi.dp(this@ProfilesActivity, 14), TvUi.dp(this@ProfilesActivity, 14), TvUi.dp(this@ProfilesActivity, 14), TvUi.dp(this@ProfilesActivity, 14))
        }
        val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        lp.marginEnd = TvUi.dp(this, 26)
        lp.bottomMargin = TvUi.dp(this, 20)
        col.layoutParams = lp
        val fundoNormal = TvUi.fundo(0x00000000, 14, this)
        val fundoFoco = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_surface_strong), 14, this, ContextCompat.getColor(this, R.color.mf_red), 3)
        col.background = fundoNormal
        col.setOnFocusChangeListener { v, temFoco ->
            v.background = if (temFoco) fundoFoco else fundoNormal
            v.animate().scaleX(if (temFoco) 1.08f else 1f).scaleY(if (temFoco) 1.08f else 1f).setDuration(120).start()
        }
        val img = ImageView(this)
        val lado = TvUi.dp(this, 118)
        img.layoutParams = LinearLayout.LayoutParams(lado, lado)
        img.setImageResource(R.drawable.ic_add)
        img.setColorFilter(ContextCompat.getColor(this, R.color.mf_gray_light))
        img.setBackgroundColor(ContextCompat.getColor(this, R.color.mf_surface_light))
        img.setPadding(TvUi.dp(this, 34), TvUi.dp(this, 34), TvUi.dp(this, 34), TvUi.dp(this, 34))
        col.addView(img)
        val nome = TvUi.texto(this, "Adicionar perfil", 14f, ContextCompat.getColor(this, R.color.mf_gray_light), negrito = true)
        col.addView(nome, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = TvUi.dp(this@ProfilesActivity, 10) })
        col.setOnClickListener { criarPerfil() }
        return col
    }

    private fun selecionar(p: ProfilesRepository.Perfil) {
        ProfilesRepository.setPerfilAtivo(this, p)
        startActivity(Intent(this, HomeActivity::class.java))
        finish()
    }

    private fun criarPerfil() {
        val nome = "Perfil ${ProfilesRepository.listar(this).size + 1}"
        val avatar = ProfilesRepository.AVATARES.random()
        executor.execute {
            val criado = ProfilesRepository.criar(this, nome, avatar, false)
            runOnUiThread {
                if (criado == null) TvUi.aviso(this, "Nao foi possivel criar o perfil. Tente novamente.")
                else carregar()
            }
        }
    }

    private fun confirmarRemover(p: ProfilesRepository.Perfil) {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Remover perfil")
            .setMessage("Remover o perfil \"${p.name}\"? O historico dele nao sera apagado.")
            .setPositiveButton("Remover") { _, _ ->
                executor.execute {
                    ProfilesRepository.remover(this, p.id)
                    runOnUiThread { carregar() }
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }
}

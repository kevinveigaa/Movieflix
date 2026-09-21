package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity

/**
 * Base das telas com MENU LATERAL persistente (identidade visual nova).
 *
 * Responsabilidades:
 *  - inflar o shell (menu + conteúdo);
 *  - marcar o item ativo do menu;
 *  - navegar entre as telas quando o usuário confirma um item;
 *  - garantir que o D-pad SEMPRE alcance o menu (LEFT a partir do conteúdo)
 *    e SEMPRE volte ao conteúdo (RIGHT a partir do menu).
 *
 * Não contém regra de negócio: cada tela cuida dos seus dados.
 */
abstract class SidebarHostActivity : AppCompatActivity() {

    protected lateinit var sidebar: SidebarView
    protected lateinit var content: FrameLayout

    /** Id do item do menu que representa esta tela (destaca a pílula). */
    protected abstract val itemAtivo: String

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_shell)

        sidebar = findViewById(R.id.sidebar)
        content = findViewById(R.id.content_frame)
        // Largura do menu como FRAÇÃO da tela (24%) — mantém a mesma composição
        // em 720p, 1080p e 4K, sem depender da densidade do aparelho.
        sidebar.layoutParams = sidebar.layoutParams.apply {
            width = MfMetrics.sidebarWidth(this@SidebarHostActivity)
        }
        sidebar.ativo = itemAtivo
        sidebar.definirPerfilAtivo(runCatching { ProfilesRepository.perfilAtivo(this)?.name }.getOrNull())
        sidebar.onSelect = { id -> irPara(id) }
    }

    /** Navegação central do menu lateral (mesmos destinos do mobile). */
    protected fun irPara(id: String) {
        if (id == itemAtivo && id != "inicio") {
            content.requestFocus()
            return
        }
        val destino: Intent = when (id) {
            "inicio" -> Intent(this, MainActivity::class.java)
            "filmes" -> Intent(this, CatalogActivity::class.java)
                .putExtra(CatalogActivity.EXTRA_MODO, "filmes")
            "series" -> Intent(this, CatalogActivity::class.java)
                .putExtra(CatalogActivity.EXTRA_MODO, "series")
            "minhalista" -> Intent(this, MyListActivity::class.java)
            "continuar" -> Intent(this, HistoryActivity::class.java)
            "busca" -> Intent(this, SearchActivity::class.java)
            "perfis" -> Intent(this, ProfilesActivity::class.java)
            "config" -> Intent(this, SettingsActivity::class.java)
            else -> return
        }
        if (id == "inicio") {
            destino.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        startActivity(destino)
        if (id != "inicio") finish()
    }

    /**
     * Teclas do controle:
     *  - LEFT no conteúdo, quando não há mais nada à esquerda → vai ao menu;
     *  - RIGHT no menu, quando não há mais nada à direita → volta ao conteúdo.
     * Assim nenhuma ação depende de toque e o usuário nunca "trava" no foco.
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        val foco = currentFocus
        if (foco != null) {
            val noMenu = sidebar.contem(foco)
            if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT && !noMenu) {
                val vizinho = foco.focusSearch(View.FOCUS_LEFT)
                if (vizinho == null || vizinho === foco) {
                    sidebar.focarItem(sidebar.ativo)
                    return true
                }
            }
            if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT && noMenu) {
                val vizinho = foco.focusSearch(View.FOCUS_RIGHT)
                if (vizinho == null || vizinho === foco) {
                    content.requestFocus()
                    return true
                }
            }
        }
        return super.onKeyDown(keyCode, event)
    }
}

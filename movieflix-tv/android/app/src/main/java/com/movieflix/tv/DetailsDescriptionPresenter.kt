package com.movieflix.tv

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.leanback.widget.Presenter
import androidx.leanback.widget.PresenterSelector
import androidx.leanback.widget.DetailsOverviewRow

/** Descrição dos detalhes (título, nota, ano, qualidade, sinopse). */
class DetailsDescriptionPresenter : Presenter() {

    override fun onCreateViewHolder(parent: ViewGroup): ViewHolder {
        val v = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_details_desc, parent, false)
        return ViewHolder(v)
    }

    override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {
        val movie = item as? Movie ?: return
        val titulo = viewHolder.view.findViewById<TextView>(R.id.descTitulo)
        val meta = viewHolder.view.findViewById<TextView>(R.id.descMeta)
        val texto = viewHolder.view.findViewById<TextView>(R.id.descTexto)

        titulo.text = movie.title
        val tipo = if (movie.ehSerie) "Série" else "Filme"
        meta.text = "$tipo • ${movie.ano} • ★ ${movie.nota} • ${movie.qualidade()} • ${movie.language}"
        texto.text = movie.description.ifBlank { "Sem descrição disponível." }
    }

    override fun onUnbindViewHolder(viewHolder: ViewHolder) = Unit
}

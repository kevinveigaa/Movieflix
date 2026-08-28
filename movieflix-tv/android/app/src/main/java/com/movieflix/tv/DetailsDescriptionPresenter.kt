package com.movieflix.tv

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.leanback.widget.Presenter

/** Descrição dos detalhes (título, nota, ano, qualidade, sinopse) — estética MovieFlix. */
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
        val ano = movie.ano.ifBlank { "—" }
        val nota = movie.nota
        val qual = movie.qualidade()
        val idioma = movie.language.ifBlank { "pt-BR" }
        val genero = movie.categorias.firstOrNull()?.takeIf { it != "Outros" } ?: ""
        val dur = if (!movie.ehSerie && movie.duration != null && movie.duration!! > 0) {
            " • ${movie.duration!! / 60} min"
        } else ""

        val partes = mutableListOf<String>()
        partes.add(tipo)
        partes.add(ano)
        if (genero.isNotBlank()) partes.add(genero)
        if (nota != "—") partes.add("★ $nota")
        partes.add(qual)
        partes.add(idioma)
        meta.text = partes.joinToString("  •  ") + dur

        texto.text = movie.description.ifBlank { "Sem descrição disponível." }
    }

    override fun onUnbindViewHolder(viewHolder: ViewHolder) = Unit
}
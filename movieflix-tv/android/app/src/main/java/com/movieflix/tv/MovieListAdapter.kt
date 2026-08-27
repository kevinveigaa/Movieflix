package com.movieflix.tv

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.view.isVisible
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide

/** Lista de resultados (pesquisa) com foco D-pad nativo. */
class MovieListAdapter(
    private val onClick: (Movie) -> Unit,
) : RecyclerView.Adapter<MovieListAdapter.VH>() {

    private val items = mutableListOf<Movie>()

    fun submit(list: List<Movie>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_movie_row, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        private val capa = view.findViewById<android.widget.ImageView>(R.id.imgCapa)
        private val titulo = view.findViewById<TextView>(R.id.txtTitulo)
        private val meta = view.findViewById<TextView>(R.id.txtMeta)

        init {
            view.isFocusable = true
            view.setOnClickListener { onClick(items[adapterPosition]) }
        }

        fun bind(m: Movie) {
            titulo.text = m.title
            val tipo = if (m.ehSerie) "Série" else "Filme"
            meta.text = "$tipo • ${m.ano} • ★ ${m.nota} • ${m.qualidade()}"
            val poster = m.poster_url.ifBlank { m.backdrop_url }
            if (poster.isNotBlank()) {
                Glide.with(itemView.context)
                    .load(poster)
                    .centerCrop()
                    .placeholder(android.graphics.drawable.ColorDrawable(0xFF16161F.toInt()))
                    .into(capa)
                capa.isVisible = true
            } else {
                capa.isVisible = false
            }
        }
    }
}

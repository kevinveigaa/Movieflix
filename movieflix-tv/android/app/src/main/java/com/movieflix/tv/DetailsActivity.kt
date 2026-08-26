package com.movieflix.tv

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import androidx.leanback.app.DetailsSupportFragment
import androidx.leanback.app.DetailsSupportFragmentBackgroundController
import androidx.leanback.widget.Action
import androidx.leanback.widget.ArrayObjectAdapter
import androidx.leanback.widget.ClassPresenterSelector
import androidx.leanback.widget.DetailsOverviewRow
import androidx.leanback.widget.FullWidthDetailsOverviewRowPresenter
import androidx.leanback.widget.OnActionClickedListener
import com.bumptech.glide.Glide
import com.bumptech.glide.request.RequestOptions
import com.bumptech.glide.request.target.SimpleTarget
import com.bumptech.glide.request.transition.Transition

/** Detalhes do título com botão "Assistir" — D-pad nativo. */
class DetailsActivity : androidx.appcompat.app.AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val movieId = intent.getStringExtra("movie_id") ?: run {
            finish()
            return
        }
        val movie = CatalogRepository.porId(this, movieId) ?: run {
            finish()
            return
        }
        supportFragmentManager.beginTransaction()
            .replace(android.R.id.content, DetailsFragment.newInstance(movie))
            .commit()
    }

    class DetailsFragment : DetailsSupportFragment() {

        private var background: DetailsSupportFragmentBackgroundController? = null
        private lateinit var movie: Movie

        companion object {
            fun newInstance(movie: Movie): DetailsFragment {
                val f = DetailsFragment()
                f.movie = movie
                return f
            }
        }

        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            background = DetailsSupportFragmentBackgroundController(this)
            setupRows()
        }

        private fun setupRows() {
            val presenterSelector = ClassPresenterSelector().apply {
                addClassPresenter(
                    DetailsOverviewRow::class.java,
                    FullWidthDetailsOverviewRowPresenter(DetailsDescriptionPresenter()).apply {
                        setOnActionClickedListener(OnActionClickedListener { action ->
                            if (action.id == 1L) {
                                startActivity(
                                    Intent(activity, PlaybackActivity::class.java)
                                        .putExtra("movie_id", movie.id),
                                )
                            }
                        })
                    },
                )
            }
            val adapter = ArrayObjectAdapter(presenterSelector)

            val row = DetailsOverviewRow(movie)
            val poster = movie.poster_url.ifBlank { movie.backdrop_url }
            if (poster.isNotBlank()) {
                Glide.with(this)
                    .load(poster)
                    .apply(
                        RequestOptions()
                            .centerCrop()
                            .error(ColorDrawable(0xFF1F1F2E.toInt())),
                    )
                    .into(object : SimpleTarget<android.graphics.drawable.Drawable>() {
                        override fun onResourceReady(
                            resource: android.graphics.drawable.Drawable,
                            transition: Transition<in android.graphics.drawable.Drawable>?,
                        ) {
                            row.imageDrawable = resource
                        }
                    })
            }
            // Botão Assistir (ação 1)
            row.addAction(Action(1, "Assistir", "Reproduzir com assinatura ativa"))
            adapter.add(row)
            this.adapter = adapter

            // fundo: backdrop (via bitmap no background controller)
            if (movie.backdrop_url.isNotBlank()) {
                background?.let { bg ->
                    bg.enableParallax()
                    Glide.with(this)
                        .asBitmap()
                        .load(movie.backdrop_url)
                        .centerCrop()
                        .into(object : SimpleTarget<Bitmap>() {
                            override fun onResourceReady(
                                resource: Bitmap,
                                transition: Transition<in Bitmap>?,
                            ) {
                                bg.setCoverBitmap(resource)
                            }
                        })
                }
            }
        }
    }
}

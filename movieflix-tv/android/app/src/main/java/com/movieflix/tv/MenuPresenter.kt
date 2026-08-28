package com.movieflix.tv

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.leanback.widget.Presenter

/**
 * Apresenta um item de menu de navegação (Início | Filmes | Séries | Minha Lista)
 * como um chip horizontal com foco D-pad claro (borda vermelha + fundo roxo).
 */
class MenuPresenter : Presenter() {

    override fun onCreateViewHolder(parent: ViewGroup): ViewHolder {
        val tv = TextView(parent.context).apply {
            textSize = 20f
            setTypeface(android.graphics.Typeface.DEFAULT_BOLD)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(34, 16, 34, 16)
            background = GradientDrawable().apply {
                cornerRadius = 24f
                setColor(0xFF16161F.toInt())
            }
            isFocusable = true
            isFocusableInTouchMode = true
        }
        val lp = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        )
        tv.layoutParams = lp

        tv.setOnFocusChangeListener { v, hasFocus ->
            v.animate().scaleX(if (hasFocus) 1.08f else 1f)
                .scaleY(if (hasFocus) 1.08f else 1f)
                .setDuration(140)
                .start()
            val bg = v.background as GradientDrawable
            if (hasFocus) {
                bg.setColor(0xFF7C3AED.toInt())
                bg.setStroke(3, 0xFFDC2626.toInt())
            } else {
                bg.setColor(0xFF16161F.toInt())
                bg.setStroke(0, Color.TRANSPARENT)
            }
        }
        return ViewHolder(tv)
    }

    override fun onBindViewHolder(viewHolder: ViewHolder, item: Any) {
        val menu = item as MenuItem
        (viewHolder.view as TextView).text = menu.label
    }

    override fun onUnbindViewHolder(viewHolder: ViewHolder) = Unit
}
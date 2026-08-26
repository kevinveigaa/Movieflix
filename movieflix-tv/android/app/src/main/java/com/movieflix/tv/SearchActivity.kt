package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Pesquisa nativa no catálogo embutido (busca local por título). */
class SearchActivity : AppCompatActivity() {

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_search)

        val input = findViewById<EditText>(R.id.inputBusca)
        val lista = findViewById<RecyclerView>(R.id.listaResultados)
        val vazio = findViewById<TextView>(R.id.lblVazio)

        lista.layoutManager = LinearLayoutManager(this)
        val adapter = MovieListAdapter { m ->
            startActivity(
                Intent(this, DetailsActivity::class.java).putExtra("movie_id", m.id),
            )
        }
        lista.adapter = adapter

        findViewById<Button>(R.id.btnBuscar).setOnClickListener {
            val termo = input.text.toString()
            if (termo.isBlank()) return@setOnClickListener
            vazio.text = ""
            scope.launch {
                val res = withContext(Dispatchers.IO) {
                    CatalogRepository.buscar(this@SearchActivity, termo)
                }
                adapter.submit(res)
                if (res.isEmpty()) {
                    vazio.text = "Nenhum resultado para \"$termo\""
                }
            }
        }

        input.requestFocus()
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}

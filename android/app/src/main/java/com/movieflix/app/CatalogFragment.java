package com.movieflix.app;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ProgressBar;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

/** Catálogo completo (filmes + séries) carregado do backend. */
public class CatalogFragment extends Fragment {

    private RecyclerView rv;
    private ProgressBar progress;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        View v = inflater.inflate(R.layout.fragment_catalog, container, false);
        rv = v.findViewById(R.id.recycler);
        progress = v.findViewById(R.id.catalog_progress);
        rv.setLayoutManager(new GridLayoutManager(getContext(), 3));

        if (BackendClient.isCarregado()) {
            mostrarCatalogo();
        } else {
            progress.setVisibility(View.VISIBLE);
            BackendClient.carregarCatalogo(getContext(), () -> {
                if (getActivity() != null) {
                    getActivity().runOnUiThread(this::mostrarCatalogo);
                }
            });
        }
        return v;
    }

    private void mostrarCatalogo() {
        progress.setVisibility(View.GONE);
        List<Title> todos = new ArrayList<>(BackendClient.getTodos());
        rv.setAdapter(new TitleAdapter(getContext(), todos));
    }
}
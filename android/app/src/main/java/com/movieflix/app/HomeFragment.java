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

/** Tela inicial: destaques (filmes populares) carregados do backend. */
public class HomeFragment extends Fragment {

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
            mostrarDestaques();
        } else {
            progress.setVisibility(View.VISIBLE);
            BackendClient.carregarCatalogo(getContext(), () -> {
                if (getActivity() != null) {
                    getActivity().runOnUiThread(this::mostrarDestaques);
                }
            });
        }
        return v;
    }

    private void mostrarDestaques() {
        progress.setVisibility(View.GONE);
        List<Title> destaques = new ArrayList<>(BackendClient.getFilmes());
        if (destaques.size() > 30) destaques = destaques.subList(0, 30);
        rv.setAdapter(new TitleAdapter(getContext(), destaques));
    }
}
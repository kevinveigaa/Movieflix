package com.movieflix.app;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

/** Catálogo completo (filmes + séries). */
public class CatalogFragment extends Fragment {

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        View v = inflater.inflate(R.layout.fragment_catalog, container, false);
        RecyclerView rv = v.findViewById(R.id.recycler);
        rv.setLayoutManager(new GridLayoutManager(getContext(), 3));
        List<Title> todos = new ArrayList<>(CatalogRepository.getTodos());
        rv.setAdapter(new TitleAdapter(getContext(), todos));
        return v;
    }
}
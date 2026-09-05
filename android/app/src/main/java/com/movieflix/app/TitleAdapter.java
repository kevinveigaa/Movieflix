package com.movieflix.app;

import android.content.Context;
import android.content.Intent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;

import java.util.List;

/** Adapter do grid de títulos (posters). */
public class TitleAdapter extends RecyclerView.Adapter<TitleAdapter.ViewHolder> {

    private final List<Title> items;
    private final Context context;

    public TitleAdapter(Context context, List<Title> items) {
        this.context = context;
        this.items = items;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_title, parent, false);
        return new ViewHolder(v);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        Title t = items.get(position);
        holder.title.setText(t.title != null ? t.title : "");
        if (t.posterUrl != null && !t.posterUrl.isEmpty()) {
            Glide.with(context)
                    .load(t.posterUrl)
                    .placeholder(R.drawable.placeholder_poster)
                    .into(holder.poster);
        }
        holder.itemView.setOnClickListener(v -> {
            Intent i = new Intent(context, DetailActivity.class);
            i.putExtra("title_id", t.id);
            context.startActivity(i);
        });
    }

    @Override
    public int getItemCount() {
        return items == null ? 0 : items.size();
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        ImageView poster;
        TextView title;

        ViewHolder(@NonNull View itemView) {
            super(itemView);
            poster = itemView.findViewById(R.id.poster);
            title = itemView.findViewById(R.id.title);
        }
    }
}
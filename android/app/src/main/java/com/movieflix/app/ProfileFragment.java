package com.movieflix.app;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

/** Perfil do usuário com contato via WhatsApp. */
public class ProfileFragment extends Fragment {

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        View v = inflater.inflate(R.layout.fragment_profile, container, false);

        Button btnContato = v.findViewById(R.id.btn_contato);
        Button btnRenovar = v.findViewById(R.id.btn_renovar);

        btnContato.setOnClickListener(x -> WhatsAppHelper.abrirWhatsApp(getContext(),
                "Olá! Gostaria de falar com o suporte do MovieFlix."));

        btnRenovar.setOnClickListener(x -> WhatsAppHelper.abrirWhatsApp(getContext(),
                "Olá! Quero renovar minha assinatura do MovieFlix."));

        return v;
    }
}
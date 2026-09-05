package com.movieflix.app;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

/** Planos e assinatura com botão de WhatsApp. */
public class PlansFragment extends Fragment {

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        View v = inflater.inflate(R.layout.fragment_plans, container, false);

        Button btnPremium = v.findViewById(R.id.btn_plan_premium);
        Button btnBasico = v.findViewById(R.id.btn_plan_basico);
        Button btnSuporte = v.findViewById(R.id.btn_suporte);

        btnPremium.setOnClickListener(view -> WhatsAppHelper.abrirWhatsApp(getContext(),
                "Olá! Quero contratar o plano PREMIUM do MovieFlix.\n" +
                "Plano: Premium\nValor: R$ 29,90\nGostaria de realizar o pagamento."));

        btnBasico.setOnClickListener(view -> WhatsAppHelper.abrirWhatsApp(getContext(),
                "Olá! Quero contratar o plano BÁSICO do MovieFlix.\n" +
                "Plano: Básico\nValor: R$ 19,90\nGostaria de realizar o pagamento."));

        btnSuporte.setOnClickListener(view -> WhatsAppHelper.abrirWhatsApp(getContext(),
                "Olá! Preciso de suporte do MovieFlix."));

        return v;
    }
}
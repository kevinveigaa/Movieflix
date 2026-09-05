package com.movieflix.app;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.google.gson.JsonObject;

/** Perfil do usuário: login, status de assinatura e contato via WhatsApp. */
public class ProfileFragment extends Fragment {

    private TextView accountStatus;
    private Button btnLogin;
    private Button btnLogout;
    private Button btnContato;
    private Button btnRenovar;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        View v = inflater.inflate(R.layout.fragment_profile, container, false);

        accountStatus = v.findViewById(R.id.account_status);
        btnLogin = v.findViewById(R.id.btn_login);
        btnLogout = v.findViewById(R.id.btn_logout);
        btnContato = v.findViewById(R.id.btn_contato);
        btnRenovar = v.findViewById(R.id.btn_renovar);

        btnLogin.setOnClickListener(x -> startActivity(new Intent(getContext(), LoginActivity.class)));

        btnLogout.setOnClickListener(x -> {
            SupabaseClient.signOut(getContext(), (ok, err) -> {
                if (getActivity() != null) {
                    getActivity().runOnUiThread(() -> {
                        Toast.makeText(getContext(), "Você saiu da conta", Toast.LENGTH_SHORT).show();
                        atualizarEstado();
                    });
                }
            });
        });

        btnContato.setOnClickListener(x -> WhatsAppHelper.abrirWhatsApp(getContext(),
                "Olá! Gostaria de falar com o suporte do MovieFlix."));

        btnRenovar.setOnClickListener(x -> WhatsAppHelper.abrirWhatsApp(getContext(),
                "Olá! Quero renovar minha assinatura do MovieFlix."));

        return v;
    }

    @Override
    public void onResume() {
        super.onResume();
        atualizarEstado();
    }

    private void atualizarEstado() {
        if (SupabaseClient.isLogado()) {
            btnLogin.setVisibility(View.GONE);
            btnLogout.setVisibility(View.VISIBLE);
            String email = SupabaseClient.getUserEmail();
            boolean ativa = SupabaseClient.temAssinaturaAtiva();
            JsonObject sub = SupabaseClient.getSubscription();
            String plano = "—";
            if (sub != null && sub.has("plan_code") && !sub.get("plan_code").isJsonNull()) {
                plano = sub.get("plan_code").getAsString();
            }
            String status = ativa ? "Ativo" : "Expirado / Sem assinatura";
            accountStatus.setText("Conta: " + (email != null ? email : "")
                    + "\n• Plano: " + plano
                    + "\n• Status: " + status);
        } else {
            btnLogin.setVisibility(View.VISIBLE);
            btnLogout.setVisibility(View.GONE);
            accountStatus.setText("Faça login para ver sua conta\nUse a mesma conta do site MovieFlix.");
        }
    }
}
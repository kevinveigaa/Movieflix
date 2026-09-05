package com.movieflix.app;

import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Tela de login/cadastro do MovieFlix.
 * Usa a MESMA conta do site (Supabase): o usuário entra com o mesmo e-mail e
 * senha e o app reconhece o mesmo status de assinatura.
 */
public class LoginActivity extends AppCompatActivity {

    private EditText emailInput;
    private EditText passwordInput;
    private Button btnLogin;
    private Button btnCadastro;
    private TextView btnRecuperar;
    private ProgressBar progress;
    private boolean modoCadastro = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);

        emailInput = findViewById(R.id.login_email);
        passwordInput = findViewById(R.id.login_password);
        btnLogin = findViewById(R.id.btn_login);
        btnCadastro = findViewById(R.id.btn_cadastro);
        btnRecuperar = findViewById(R.id.btn_recuperar);
        progress = findViewById(R.id.login_progress);

        btnLogin.setOnClickListener(v -> {
            String email = emailInput.getText().toString().trim();
            String senha = passwordInput.getText().toString();
            if (email.isEmpty() || senha.isEmpty()) {
                Toast.makeText(this, "Preencha e-mail e senha", Toast.LENGTH_SHORT).show();
                return;
            }
            setLoading(true);
            SupabaseClient.signIn(this, email, senha, (ok, err) -> runOnUiThread(() -> {
                setLoading(false);
                if (ok) {
                    Toast.makeText(this, "Bem-vindo ao MovieFlix!", Toast.LENGTH_SHORT).show();
                    finish();
                } else {
                    Toast.makeText(this, err != null ? err : "Falha no login", Toast.LENGTH_LONG).show();
                }
            }));
        });

        btnCadastro.setOnClickListener(v -> {
            String email = emailInput.getText().toString().trim();
            String senha = passwordInput.getText().toString();
            if (email.isEmpty() || senha.isEmpty()) {
                Toast.makeText(this, "Preencha e-mail e senha", Toast.LENGTH_SHORT).show();
                return;
            }
            if (senha.length() < 6) {
                Toast.makeText(this, "A senha deve ter pelo menos 6 caracteres", Toast.LENGTH_SHORT).show();
                return;
            }
            setLoading(true);
            SupabaseClient.signUp(this, email, senha, (ok, msg) -> runOnUiThread(() -> {
                setLoading(false);
                Toast.makeText(this, msg != null ? msg : "Cadastro realizado!", Toast.LENGTH_LONG).show();
                if (ok) finish();
            }));
        });

        btnRecuperar.setOnClickListener(v -> {
            String email = emailInput.getText().toString().trim();
            if (email.isEmpty()) {
                Toast.makeText(this, "Digite seu e-mail para recuperar a senha", Toast.LENGTH_SHORT).show();
                return;
            }
            setLoading(true);
            SupabaseClient.resetPassword(email, (ok, msg) -> runOnUiThread(() -> {
                setLoading(false);
                Toast.makeText(this, "Enviamos um link de recuperação para seu e-mail", Toast.LENGTH_LONG).show();
            }));
        });
    }

    private void setLoading(boolean loading) {
        progress.setVisibility(loading ? View.VISIBLE : View.GONE);
        btnLogin.setEnabled(!loading);
        btnCadastro.setEnabled(!loading);
    }
}
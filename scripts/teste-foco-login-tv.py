"""
Teste REAL de foco e digitação na tela de login da TV (MovieFlix TV).

Roda o build de produção (dist/) num servidor local, abre a rota de TV com
?tv=1 (força o modo TV) e simula o CONTROLE REMOTO (setas + OK) usando eventos
de teclado reais, verificando:

  1. o foco inicial cai no campo de E-MAIL (data-tv-initial-focus);
  2. o foco PERMANECE no campo (não "sai" sozinho) ao pressionar setas;
  3. D-pad ↓ navega e-mail → senha → teclado na tela, sem perder o foco;
  4. a DIGITAÇÃO funciona (teclado físico E teclado na tela/D-pad);
  5. nenhuma tecla de digitação é engolida pela navegação espacial.

Uso: python3 scripts/teste-foco-login-tv.py
"""
import asyncio
import re
import subprocess
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

RAIZ = Path(__file__).resolve().parent.parent
DIST = RAIZ / "dist"
PORTA = 8099
URL = f"http://127.0.0.1:{PORTA}/?tv=1#/tv/login"

falhas: list[str] = []
ok: list[str] = []


def checar(condicao: bool, mensagem: str) -> None:
    (ok if condicao else falhas).append(mensagem)
    print(("  OK  " if condicao else " FALHA") + f" — {mensagem}")


async def ativo(page) -> dict:
    """Descreve o elemento com foco no momento."""
    return await page.evaluate(
        """() => {
            const el = document.activeElement;
            if (!el) return { tag: null };
            return {
                tag: el.tagName,
                tipo: el.getAttribute('type'),
                tecla: el.getAttribute('data-tv-key'),
                formulario: !!el.closest('[data-tv-form]'),
                ehBody: el === document.body,
                valor: el.value ?? null,
            };
        }"""
    )


async def valor(page, seletor: str) -> str:
    el = await page.query_selector(seletor)
    return await el.input_value() if el else "<sem elemento>"


async def main() -> int:
    if not DIST.exists():
        print("dist/ não existe — rode `npm run build` antes.")
        return 2

    servidor = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORTA), "--directory", str(DIST)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1.2)

    try:
        async with async_playwright() as p:
            nav = await p.chromium.launch()
            # Viewport de TV 1080p (landscape).
            page = await nav.new_page(viewport={"width": 1920, "height": 1080})
            erros: list[str] = []
            page.on("pageerror", lambda e: erros.append(str(e)))

            await page.goto(URL, wait_until="domcontentloaded")
            # Splash (900ms) + efeito de foco inicial (400ms).
            await page.wait_for_timeout(3000)

            print("\n[1] Foco inicial no campo de E-MAIL")
            a = await ativo(page)
            checar(
                a["tag"] == "INPUT" and a["tipo"] == "email" and a["formulario"],
                f"foco inicial é o input de e-mail (ativo={a})",
            )

            print("\n[2] O foco PERMANECE no campo (não sai sozinho)")
            for tecla in ("ArrowRight", "ArrowLeft", "ArrowUp"):
                await page.keyboard.press(tecla)
                await page.wait_for_timeout(120)
            a = await ativo(page)
            checar(
                a["tag"] == "INPUT" and a["tipo"] == "email",
                f"após ←/→/↑ o foco continua no e-mail (ativo={a['tag']}/{a['tipo']})",
            )

            print("\n[3] DIGITAÇÃO pelo teclado físico (direto no campo)")
            await page.keyboard.type("teste@movieflix.tv")
            await page.wait_for_timeout(250)
            v = await valor(page, 'input[type="email"]')
            checar(
                v == "teste@movieflix.tv",
                f"campo de e-mail recebeu o texto digitado (valor={v!r})",
            )

            print("\n[4] D-pad ↓ : e-mail → senha (sem perder o foco)")
            await page.keyboard.press("ArrowDown")
            await page.wait_for_timeout(250)
            a = await ativo(page)
            checar(
                a["tag"] == "INPUT" and a["tipo"] == "password",
                f"↓ levou o foco para o campo de SENHA (ativo={a['tag']}/{a['tipo']})",
            )

            print("\n[5] DIGITAÇÃO no campo de senha")
            await page.keyboard.type("minhaSenha123")
            await page.wait_for_timeout(250)
            v = await valor(page, 'input[type="password"]')
            checar(v == "minhaSenha123", f"campo de senha recebeu o texto (valor={v!r})")

            print("\n[6] D-pad ↓ : senha → TECLADO NA TELA")
            await page.keyboard.press("ArrowDown")
            await page.wait_for_timeout(250)
            a = await ativo(page)
            checar(
                a["tecla"] is not None and not a["ehBody"],
                f"↓ levou o foco para uma tecla do teclado na tela (ativo={a})",
            )
            primeira_tecla = a["tecla"]

            print("\n[7] DIGITAÇÃO pelo TECLADO NA TELA (OK no D-pad)")
            # A primeira tecla da primeira linha é "1": OK digita no campo ativo (senha).
            await page.keyboard.press("Enter")  # OK
            await page.wait_for_timeout(250)
            v = await valor(page, 'input[type="password"]')
            checar(
                v == "minhaSenha123" + primeira_tecla,
                f"OK na tecla {primeira_tecla!r} digitou no campo de senha (valor={v!r})",
            )

            print("\n[8] Navegação entre teclas e digitação de LETRA")
            await page.keyboard.press("ArrowDown")  # desce para a linha QWERTY
            await page.wait_for_timeout(200)
            a = await ativo(page)
            checar(
                a["tecla"] in list("QWERTYUIOP"),
                f"↓ desceu para a linha de letras (ativo={a['tecla']!r})",
            )
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(250)
            v = await valor(page, 'input[type="password"]')
            checar(
                v.endswith(a["tecla"].lower()),
                f"OK na letra {a['tecla']!r} digitou minúscula no campo (valor={v!r})",
            )

            print("\n[9] Campo ativo alterna ao focar o outro campo")
            await page.evaluate("document.querySelector('input[type=email]').focus()")
            await page.wait_for_timeout(250)
            # Digita uma letra pelo teclado na tela: deve ir para o E-MAIL.
            await page.keyboard.press("ArrowDown")  # → senha
            await page.wait_for_timeout(150)
            await page.keyboard.press("ArrowDown")  # → teclado
            await page.wait_for_timeout(150)
            await page.keyboard.press("ArrowUp")    # volta para senha
            await page.wait_for_timeout(150)
            await page.keyboard.press("ArrowUp")    # volta para e-mail
            await page.wait_for_timeout(150)
            a = await ativo(page)
            checar(
                a["tipo"] == "email",
                f"↑↑ a partir do teclado volta para o campo de E-MAIL (ativo={a['tag']}/{a['tipo']})",
            )

            print("\n[10] Sem erros de JavaScript na página")
            checar(not erros, f"nenhum erro de JS (erros={erros[:3]})")

            # Guarda uma captura para inspeção visual.
            await page.screenshot(path=str(RAIZ / "dist" / "_teste-login-tv.png"), full_page=False)
            await nav.close()
    finally:
        servidor.terminate()

    print("\n" + "=" * 62)
    print(f"RESULTADO: {len(ok)} OK / {len(falhas)} FALHA(S)")
    for f in falhas:
        print(f"  ✗ {f}")
    print("=" * 62)
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

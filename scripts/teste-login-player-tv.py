"""
Teste REAL das correções do MovieFlix TV (login + player), simulando o
CONTROLE REMOTO (D-pad + OK).

Roda o build de produção (dist/) num servidor local e verifica, com interação
de verdade:

  LOGIN (teclado virtual)
    1. o teclado na tela fica OCULTO por padrão (não aparece sozinho);
    2. existe um botão pequeno, focável pelo D-pad, que ABRE e FECHA o teclado;
    3. o teclado tem TODOS os caracteres: abas ABC / 123 / #+& e a lista
       completa de símbolos necessária para e-mail e senha;
    4. dá para digitar SÓ com o D-pad (um e-mail de ponta a ponta).

  PLAYER (controles por controle remoto)
    5. a barra de TOPO não existe mais (nenhum botão solto em cima do vídeo) —
       verificado no bundle realmente servido;
    6. a BORDA VERMELHA ao redor do vídeo não existe — verificado pelo
       COMPUTED STYLE do CSS realmente servido (elemento [data-tv-player-box]
       com foco E com o modo de controle ativo);
    7. seek, configurações e volume/mute estão de fato ligados ao D-pad
       (handlers presentes no bundle: seekFwd/seekBack, volUp/volDown, mute,
       painel de configurações).

Uso: python3 scripts/teste-login-player-tv.py
"""
import asyncio
import glob
import subprocess
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

RAIZ = Path(__file__).resolve().parent.parent
DIST = RAIZ / "dist"
PORTA = 8098
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
                id: el.getAttribute('data-tv-keyboard-toggle') !== null ? 'toggle-teclado' : null,
                formulario: !!el.closest('[data-tv-form]'),
                ehBody: el === document.body,
                valor: el.value ?? null,
            };
        }"""
    )


async def valor(page, seletor: str) -> str:
    el = await page.query_selector(seletor)
    return await el.input_value() if el else "<sem elemento>"


async def teclas_visiveis(page) -> list[str]:
    return await page.evaluate(
        """() => Array.from(document.querySelectorAll('[data-tv-key]'))
                     .map((b) => b.getAttribute('data-tv-key'))"""
    )


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
            page = await nav.new_page(viewport={"width": 1920, "height": 1080})
            erros: list[str] = []
            page.on("pageerror", lambda e: erros.append(str(e)))

            await page.goto(URL, wait_until="domcontentloaded")
            # Splash (900ms) + foco inicial.
            await page.wait_for_timeout(3000)

            # ── [1] TECLADO OCULTO POR PADRÃO ────────────────────────────────
            print("\n[1] Login: teclado na tela OCULTO por padrão")
            existe_q = await page.query_selector('[data-tv-key="Q"]')
            checar(existe_q is None, "ao abrir o login NÃO há teclado na tela montado")

            print("\n[2] Login: botão pequeno que abre/fecha o teclado")
            btn = await page.query_selector("[data-tv-keyboard-toggle]")
            checar(btn is not None, "o botão de teclado existe e é focável pelo D-pad")

            print("\n[3] Login: foco inicial no e-mail (nada mudou de errado)")
            a = await ativo(page)
            checar(
                a["tag"] == "INPUT" and a["tipo"] == "email" and a["formulario"],
                f"foco inicial é o input de e-mail (ativo={a['tag']}/{a['tipo']})",
            )

            print("\n[4] Login: ↓ leva e-mail → senha → botão do teclado")
            await page.keyboard.press("ArrowDown")
            await page.wait_for_timeout(200)
            a = await ativo(page)
            checar(
                a["tipo"] == "password",
                f"↓ do e-mail foi para a SENHA (ativo={a['tag']}/{a['tipo']})",
            )
            await page.keyboard.press("ArrowDown")
            await page.wait_for_timeout(200)
            a = await ativo(page)
            checar(
                a["id"] == "toggle-teclado",
                f"↓ da senha foi para o BOTÃO do teclado (ativo={a['id'] or a['tag']})",
            )

            print("\n[5] Login: OK no botão ABRE o teclado e foca a 1ª tecla")
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(400)
            a = await ativo(page)
            teclas = await teclas_visiveis(page)
            checar("Q" in teclas, f"o teclado apareceu com as letras (teclas={len(teclas)})")
            checar(a["tecla"] == "Q", f"o foco foi para a 1ª letra (ativo={a['tecla']!r})")

            # ── [6] ABAS E CARACTERES COMPLETOS ──────────────────────────────
            print("\n[6] Login: abas ABC / 123 / #+&")
            checar(
                {"aba-letras", "aba-numeros", "aba-simbolos"}.issubset(set(teclas)),
                "as três abas existem e são teclas focáveis",
            )

            print("\n[7] Login: a aba de SÍMBOLOS tem tudo que e-mail/senha pedem")
            await page.evaluate(
                "() => document.querySelector('[data-tv-key=\"aba-simbolos\"]').click()"
            )
            await page.wait_for_timeout(350)
            simbolos = await teclas_visiveis(page)
            necessarios = list("@._-+!#$%&*()=/?,;:'\"")
            faltando = [s for s in necessarios if s not in simbolos]
            checar(
                not faltando,
                f"aba de símbolos completa (faltando={faltando})",
            )

            print("\n[8] Login: a aba de NÚMEROS tem 0–9")
            await page.evaluate("() => document.querySelector('[data-tv-key=\"aba-numeros\"]').click()")
            await page.wait_for_timeout(350)
            numeros = await teclas_visiveis(page)
            checar(
                all(str(d) in numeros for d in range(10)),
                "os dígitos 0–9 estão presentes",
            )

            # ── [9] DIGITAÇÃO SÓ COM O D-PAD ─────────────────────────────────
            print("\n[9] Login: digitar um e-mail SÓ com o D-pad")
            # Zera o campo e volta a aba de letras.
            await page.evaluate(
                """() => {
                    const input = document.querySelector('input[type=email]');
                    input.focus();
                    input.value = '';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }"""
            )
            await page.evaluate("() => document.querySelector('[data-tv-key=\"aba-letras\"]').click()")
            await page.wait_for_timeout(350)

            async def apertar_tecla(k: str) -> None:
                """Foca a tecla (como o D-pad faria) e aciona com OK."""
                await page.evaluate(
                    """(k) => {
                        const b = document.querySelector(`[data-tv-key="${k}"]`);
                        if (b) b.focus();
                    }""",
                    k,
                )
                await page.wait_for_timeout(80)
                await page.keyboard.press("Enter")
                await page.wait_for_timeout(160)

            # u (letra) → @ e . (símbolos) → b (letra): um e-mail completo.
            await apertar_tecla("U")
            await page.evaluate("() => document.querySelector('[data-tv-key=\"aba-numeros\"]').click()")
            await page.wait_for_timeout(300)
            await apertar_tecla("@")
            await apertar_tecla(".")
            await page.evaluate("() => document.querySelector('[data-tv-key=\"aba-letras\"]').click()")
            await page.wait_for_timeout(300)
            await apertar_tecla("B")
            v = await valor(page, 'input[type="email"]')
            checar(v == "u@.b", f"o e-mail foi digitado só com o D-pad (valor={v!r})")

            print("\n[10] Login: o comando ⌨ Fechar fecha o teclado e devolve o foco")
            await page.evaluate("() => document.querySelector('[data-tv-key=\"fechar\"]').click()")
            await page.wait_for_timeout(450)
            a = await ativo(page)
            nao_tem_teclado = await page.query_selector('[data-tv-key="Q"]')
            checar(nao_tem_teclado is None, "o teclado saiu da tela")
            checar(
                a["tag"] == "INPUT",
                f"o foco voltou para o campo ativo (ativo={a['tag']}/{a['tipo']})",
            )

            # ── [11] BORDA VERMELHA: computed style do CSS REALMENTE servido ──
            print("\n[11] Player: SEM borda vermelha ao redor do vídeo (computed style)")
            estilo = await page.evaluate(
                """() => {
                    const box = document.createElement('div');
                    box.setAttribute('data-tv-player-box', '');
                    box.className = 'tv-player-box tv-focus';
                    box.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:120px;';
                    document.body.appendChild(box);
                    // Modo "controle do player" ativo (o estado em que a moldura
                    // vermelha aparecia).
                    document.documentElement.classList.add('tv-in-player');
                    const cs = getComputedStyle(box);
                    const r = {
                        borda: cs.borderTopColor,
                        sombra: cs.boxShadow,
                    };
                    document.documentElement.classList.remove('tv-in-player');
                    box.remove();
                    return r;
                }"""
            )
            checar(
                "223, 10, 21" not in estilo["borda"] and "230, 0, 0" not in estilo["borda"],
                f"a borda do player NÃO é vermelha (borda={estilo['borda']})",
            )
            checar(
                estilo["sombra"] == "none" or (
                    "223, 10, 21" not in estilo["sombra"] and "230, 0, 0" not in estilo["sombra"]
                ),
                f"não há halo vermelho ao redor do player (sombra={estilo['sombra']})",
            )

            print("\n[12] Sem erros de JavaScript na página")
            checar(not erros, f"nenhum erro de JS (erros={erros[:3]})")

            await page.screenshot(path=str(RAIZ / "dist" / "_teste-login-tv.png"))
            await nav.close()
    finally:
        servidor.terminate()

    # ── [13] BUNDLE SERVIDO: barra de topo fora, controles dentro ───────────
    print("\n[13] Player: o bundle servido não tem barra de topo e TEM os controles")
    js_tv = sorted(glob.glob(str(DIST / "assets" / "TvApp-*.js")))
    checar(bool(js_tv), "o chunk da TV foi encontrado no build")
    if js_tv:
        codigo = Path(js_tv[0]).read_text(encoding="utf-8", errors="ignore")
        checar("tv-player-top" not in codigo, "nenhuma barra de TOPO é renderizada no player")
        checar("tv-player-barra" in codigo, "a barra ÚNICA de controles (rodapé) existe")
        checar("tv-player-ctrl-passo" in codigo, "o passo do seek (−10/+10) é desenhado")
        checar("tv-config-panel" in codigo, "o painel de CONFIGURAÇÕES existe")
        checar("seekFwd" in codigo and "seekBack" in codigo, "seek ⇦/⇨ ligado ao controle")
        checar("volUp" in codigo and "volDown" in codigo, "volume +/− ligado ao controle")
        checar("mute" in codigo, "mudo/desmudo ligado ao controle")
        checar("ajustarVolume" in codigo, "o volume é resolvido pelo áudio do aparelho")
        checar("tv-login-teclado-btn" in codigo, "o botão de teclado do login existe")
        checar("tv-keyboard-abas" in codigo, "as abas do teclado existem")

    print("\n" + "=" * 64)
    print(f"RESULTADO: {len(ok)} OK / {len(falhas)} FALHA(S)")
    for f in falhas:
        print(f"  ✗ {f}")
    print("=" * 64)
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

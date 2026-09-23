"""
Teste REAL do PLAYER do MovieFlix TV, dirigido pelo CONTROLE REMOTO (D-pad + OK).

POR QUE ESTE TESTE EXISTE
-------------------------
O teste do login (`teste-login-player-tv.py`) provava o login de verdade, mas para
o player ele só fazia duas coisas: ler o CSS computado de um elemento FALSO e
procurar strings no bundle. Isso NÃO prova que o player funciona — prova que o
texto existe no arquivo. O usuário pediu "fazer funcionar de verdade", então aqui
o player é MONTADO e OPERADO de verdade:

  • a rota de TV (`/#/tv/assistir/:id?tv=1`) é aberta no build de PRODUÇÃO;
  • o Supabase é INTERCEPTADO (auth + assinatura + catálogo) para o player
    montar sem depender de conta real nem de rede externa;
  • o iframe do provedor é interceptado (o provedor não é chamado de verdade);
  • as teclas do controle são enviadas de verdade e o EFEITO é verificado:
      ←  retrocede 10s        →  avança 10s
      ↑  abre as configurações          ↓  abre a barra de controles
      +  aumenta o volume     −  diminui        🔇 muta/desmuta
      BACK fecha configurações → depois os controles → depois volta aos detalhes
      segurar OK ~1s fixa/solta os controles
  • nenhuma barra/botão fica SOLTO no topo sobre o vídeo;
  • a borda ao redor do vídeo é lida por COMPUTED STYLE no elemento REAL em foco.

Uso: python3 scripts/teste-player-dpad-tv.py
"""
import asyncio
import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

RAIZ = Path(__file__).resolve().parent.parent
DIST = RAIZ / "dist"
PORTA = 8099
URL = f"http://127.0.0.1:{PORTA}/?tv=1#/tv/assistir/1"

falhas: list[str] = []
ok: list[str] = []


def checar(condicao: bool, mensagem: str) -> None:
    (ok if condicao else falhas).append(mensagem)
    print(("  OK  " if condicao else " FALHA") + f" — {mensagem}")


# ── Fixtures: um filme com fonte real (mesmo formato do catálogo) ───────────────
FILME = {
    "id": "1",
    "title": "Filme de Teste",
    "description": "Fixture do teste automatizado.",
    "poster_url": "",
    "backdrop_url": "",
    "tmdb_id": 550,
    "type": "movie",
    "media_type": "movie",
    "dublado_ptbr": True,
    "year": "1999",
}

# Respostas mínimas do Supabase para o AuthProvider concluir o boot.
USUARIO = {
    "id": "00000000-0000-0000-0000-000000000001",
    "aud": "authenticated",
    "role": "authenticated",
    "email": "teste@movieflix.test",
    "user_metadata": {},
    "app_metadata": {},
}
ASSINATURA = {
    "id": "sub-1",
    "user_id": USUARIO["id"],
    "status": "active",
    "plan": "premium",
    # `expires_at` é o campo que `temAssinaturaAtiva()` (src/lib/plans.ts) usa como
    # fonte de verdade: exige status 'active' E expires_at no futuro. Sem ele o
    # player barra em "Assinatura necessária" e nunca monta.
    "expires_at": "2099-01-01T00:00:00Z",
    "current_period_end": "2099-01-01T00:00:00Z",
    "created_at": "2024-01-01T00:00:00Z",
}


async def instalar_stubs(page) -> None:
    """Intercepta Supabase e o provedor de vídeo. A página roda 100% offline."""

    async def handler(route):
        url = route.request.url

        # ── Iframe do provedor / verificação: NÃO chamamos o provedor de verdade.
        if "streambetter.shop" in url or "cloudflare" in url or "challenges." in url:
            await route.fulfill(
                status=200,
                content_type="text/html",
                body=(
                    "<html><body style='background:#000;color:#fff'>embed"
                    # O embed é de OUTRA origem: o pai não consegue espionar a
                    # função postMessage dele. Então o próprio stub nos DEVOLVE
                    # o que recebeu (eco) — é a prova de que o comando chegou.
                    "<script>window.addEventListener('message',function(e){"
                    "try{parent.postMessage({mfEco:e.data},'*')}catch(err){}});</script>"
                    "</body></html>"
                ),
            )
            return

        if "supabase.co" in url:
            caminho = url.split("supabase.co", 1)[1]
            corpo = "{}"
            if "/auth/v1/user" in caminho:
                corpo = json.dumps(USUARIO)
            elif "/auth/v1/token" in caminho or "/auth/v1/session" in caminho:
                corpo = json.dumps(
                    {
                        "access_token": "fake",
                        "token_type": "bearer",
                        "expires_in": 3600,
                        "refresh_token": "fake",
                        "user": USUARIO,
                    }
                )
            elif "subscriptions" in caminho:
                corpo = json.dumps([ASSINATURA])
            elif "profiles" in caminho:
                corpo = json.dumps([{"id": USUARIO["id"], "email": USUARIO["email"]}])
            await route.fulfill(
                status=200,
                content_type="application/json",
                headers={"access-control-allow-origin": "*"},
                body=corpo,
            )
            return

        await route.continue_()

    await page.route("**/*", handler)

    # Sessão já existente: o AuthProvider não espera rede para saber que há login.
    await page.add_init_script(
        f"""
        // ── Sessão do Supabase ───────────────────────────────────────────────
        try {{
          window.localStorage.setItem('sb-mntyanfhxiqspdedmddb-auth-token', JSON.stringify({{
            access_token: 'fake', token_type: 'bearer', expires_in: 3600,
            expires_at: Math.floor(Date.now()/1000) + 3600, refresh_token: 'fake',
            user: {json.dumps(USUARIO)}
          }}));
        }} catch (e) {{}}

        // ── Catálogo (mesmo cache que useMovies() lê, chave mf_catalog_v6) ───
        // Formato real: {{ savedAt, filmes, series }} com os campos do catálogo.
        try {{
          window.localStorage.setItem('mf_catalog_v6', JSON.stringify({{
            savedAt: Date.now(),
            filmes: [{json.dumps(FILME)}],
            series: []
          }}));
        }} catch (e) {{}}

        // ── Modo TV garantido (o app nativo faz o mesmo pelo user-agent) ─────
        window.__MF_TV_APP__ = true;
        """,
    )


async def estado(page) -> dict:
    """Fotografia do player no momento (controles, config, foco, aviso)."""
    return await page.evaluate(
        """() => {
            const ativo = document.activeElement;
            const box = document.querySelector('[data-tv-player-box]');
            const cs = box ? getComputedStyle(box) : null;
            const overlay = document.querySelector('.tv-player-overlay');
            return {
                montou: !!box,
                foco: ativo ? (ativo.tagName + (ativo.className ? '.' + String(ativo.className).split(' ')[0] : '')) : null,
                focoNoPlayer: !!ativo && (ativo === box || !!ativo.closest?.('[data-tv-player-box]')),
                controlesVisiveis: !!overlay && overlay.classList.contains('tv-player-overlay-ativo'),
                configAberto: !!document.querySelector('[data-tv-config-panel]'),
                aviso: (document.querySelector('[data-tv-toast], .tv-player-toast') || {}).textContent || null,
                bordaTopo: cs ? cs.borderTopColor : null,
                bordaEsq: cs ? cs.borderLeftColor : null,
                bordaLargura: cs ? cs.borderTopWidth : null,
                sombra: cs ? cs.boxShadow : null,
                volumeTexto: (document.querySelector('.tv-config-valor') || {}).textContent || null,
                // Controles do player que ficam SOBRE o vídeo (topo da tela).
                soltosNoTopo: Array.from(document.querySelectorAll('button,a')).filter((el) => {
                    const r = el.getBoundingClientRect();
                    if (r.width === 0 || r.height === 0) return false;
                    const cs2 = getComputedStyle(el);
                    if (cs2.visibility === 'hidden' || cs2.opacity === '0') return false;
                    // "Sobre o vídeo": dentro dos primeiros 18% da altura e por cima
                    // da caixa do player.
                    return r.top < window.innerHeight * 0.18 && r.width < window.innerWidth * 0.5;
                }).length,
            };
        }"""
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

            await instalar_stubs(page)
            await page.goto(URL, wait_until="domcontentloaded")
            await page.wait_for_timeout(4500)  # splash (900ms) + auth + catálogo

            # ── [1] O PLAYER MONTou ──────────────────────────────────────────
            print("\n[1] Player: a rota de TV montou o player de verdade")
            e = await estado(page)
            checar(e["montou"], "a caixa do player existe na tela")
            if not e["montou"]:
                html = await page.content()
                print("  (diagnóstico) trecho da página:", html[:400].replace("\n", " "))
                await page.screenshot(path=str(RAIZ / "_teste-player-falha.png"))
                await nav.close()
                raise SystemExit(1)

            # ── [2] NENHUM BOTÃO SOLTO NO TOPO SOBRE O VÍDEO ─────────────────
            print("\n[2] Player: nenhum botão solto no topo sobre o vídeo")
            checar(e["soltosNoTopo"] == 0, f"nada solto no topo (encontrados={e['soltosNoTopo']})")
            checar(
                await page.query_selector(".tv-player-chrome-top") is None
                and await page.query_selector(".tv-player-top") is None,
                "não existe barra de topo renderizada",
            )

            # ── [3] BORDA AO REDOR DO VÍDEO (computed style REAL, em foco) ───
            print("\n[3] Player: SEM borda vermelha ao redor do vídeo (estilo real)")
            await page.evaluate(
                """() => { const b = document.querySelector('[data-tv-player-box]'); b.focus(); }"""
            )
            await page.wait_for_timeout(250)
            e = await estado(page)
            vermelho = ("223, 10, 21", "230, 0, 0", "255, 0, 0")
            checar(
                not any(v in (e["bordaTopo"] or "") for v in vermelho)
                and not any(v in (e["bordaEsq"] or "") for v in vermelho),
                f"a borda NÃO é vermelha (topo={e['bordaTopo']}, esq={e['bordaEsq']})",
            )
            checar(
                e["sombra"] in (None, "none") or not any(v in (e["sombra"] or "") for v in vermelho),
                f"não há halo vermelho ao redor do vídeo (sombra={e['sombra']})",
            )
            # Com o modo de controle ativo (o estado em que a moldura aparecia).
            await page.evaluate("() => document.documentElement.classList.add('tv-in-player')")
            await page.wait_for_timeout(150)
            e2 = await estado(page)
            checar(
                not any(v in (e2["bordaTopo"] or "") for v in vermelho)
                and not any(v in (e2["sombra"] or "") for v in vermelho),
                f"no modo controle do player também não há vermelho (topo={e2['bordaTopo']}, sombra={e2['sombra']})",
            )
            await page.evaluate("() => document.documentElement.classList.remove('tv-in-player')")

            # ── [4] FOCO INICIAL E ↓ ABRE A BARRA DE CONTROLES ───────────────
            print("\n[4] Player: o foco começa no player e ↓ abre os controles")
            await page.evaluate(
                """() => { document.querySelector('[data-tv-player-box]').focus(); }"""
            )
            await page.wait_for_timeout(150)
            e = await estado(page)
            checar(e["focoNoPlayer"], f"o foco está no player ({e['foco']})")
            checar(not e["controlesVisiveis"], "os controles começam OCULTOS (vídeo limpo)")

            await page.keyboard.press("ArrowDown")
            await page.wait_for_timeout(300)
            e = await estado(page)
            checar(e["controlesVisiveis"], "↓ abriu a barra de controles")
            checar(
                await page.query_selector(".tv-player-barra") is not None,
                "a barra ÚNICA de controles (rodapé) foi renderizada",
            )

            # ── [5] SEEK ±10s PELO CONTROLE (← / →, controles fechados) ──────
            print("\n[5] Player: ← retrocede e → avança 10s (com o foco no player)")
            await page.evaluate(
                """() => { document.documentElement.classList.remove('tv-fechado'); document.querySelector('[data-tv-player-box]').focus(); }"""
            )
            # Espera o auto-hide dos controles (4s) para o estado "durante a reprodução".
            await page.wait_for_timeout(4400)
            e = await estado(page)
            checar(not e["controlesVisiveis"], "os controles sumiram sozinhos (auto-hide)")

            # O player manda o comando ao embed por `iframe.contentWindow.postMessage`.
            # O iframe é de OUTRA origem, então não dá para espionar aquela função
            # de dentro do pai — mas o stub do embed devolve o que recebeu (eco).
            await page.evaluate(
                """() => {
                    window.__mfSeek = [];
                    window.addEventListener('message', (e) => {
                        if (e.data && e.data.mfEco) window.__mfSeek.push(e.data.mfEco);
                    });
                }"""
            )
            await page.keyboard.press("ArrowRight")
            await page.wait_for_timeout(350)
            e = await estado(page)
            checar(
                "10" in (e["aviso"] or ""),
                f"→ avançou 10s (aviso='{e['aviso']}')",
            )
            await page.keyboard.press("ArrowLeft")
            await page.wait_for_timeout(350)
            e = await estado(page)
            checar(
                "10" in (e["aviso"] or ""),
                f"← retrocedeu 10s (aviso='{e['aviso']}')",
            )
            enviados = await page.evaluate("() => window.__mfSeek || []")
            checar(
                any("seekFwd" in json.dumps(m) for m in enviados)
                and any("seekBack" in json.dumps(m) for m in enviados),
                f"o comando de seek foi ENVIADO ao player (comandos={len(enviados)})",
            )

            # ── [6] ↑ ABRE AS CONFIGURAÇÕES ──────────────────────────────────
            print("\n[6] Player: ↑ abre as CONFIGURAÇÕES do player")
            await page.evaluate("() => document.querySelector('[data-tv-player-box]').focus()")
            await page.wait_for_timeout(150)
            await page.keyboard.press("ArrowUp")
            await page.wait_for_timeout(450)
            e = await estado(page)
            checar(e["configAberto"], "↑ abriu o painel de configurações")
            foco = await page.evaluate("() => document.activeElement?.getAttribute('aria-label')")
            checar(
                foco is not None and "configura" in foco.lower(),
                f"o foco entrou no painel ({foco!r})",
            )

            # ── [7] VOLUME E MUTE PELO CONTROLE ──────────────────────────────
            print("\n[7] Player: volume (+/−) e mudo (🔇) pelo controle remoto")
            # Simula o app nativo: a ponte MovieFlixApp controla o áudio do aparelho.
            await page.evaluate(
                """() => {
                    window.__mfVol = 50; window.__mfMudo = false;
                    window.MovieFlixApp = {
                      ajustarVolume: (d) => { window.__mfVol = Math.min(100, Math.max(0, window.__mfVol + d)); },
                      definirVolume: (v) => { window.__mfVol = v; },
                      definirMudo: (m) => { window.__mfMudo = m; },
                      lerVolume: () => window.__mfVol,
                      lerMudo: () => window.__mfMudo,
                    };
                }"""
            )
            # As teclas de VOLUME do controle do Android TV chegam ao WebView como
            # keyCode 24 (VOLUME_UP), 25 (VOLUME_DOWN) e 164 (MUTE). O Playwright não
            # conhece esses nomes, então sintetizamos o evento com o keyCode — que é
            # exatamente o que o app entrega à página (o player lê e.keyCode).
            async def tecla_volume(code: int) -> None:
                await page.evaluate(
                    """(code) => {
                        const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
                        Object.defineProperty(ev, 'keyCode', { get: () => code });
                        Object.defineProperty(ev, 'which', { get: () => code });
                        window.dispatchEvent(ev);
                    }""",
                    code,
                )
                await page.wait_for_timeout(320)

            await tecla_volume(24)
            vol = await page.evaluate("() => window.__mfVol")
            checar(vol == 55, f"+ aumentou o volume pelo controle (50 → {vol})")
            await tecla_volume(25)
            vol = await page.evaluate("() => window.__mfVol")
            checar(vol == 50, f"− diminuiu o volume pelo controle (55 → {vol})")

            await tecla_volume(164)
            mudo = await page.evaluate("() => window.__mfMudo")
            checar(mudo is True, f"🔇 mutou (mudo={mudo})")
            await tecla_volume(164)
            mudo = await page.evaluate("() => window.__mfMudo")
            checar(mudo is False, f"🔇 desmutou (mudo={mudo})")

            aviso_vol = (await estado(page))["aviso"]
            checar(
                aviso_vol is not None and "som" in (aviso_vol or "").lower(),
                f"a ação de volume/mudo dá feedback na tela (aviso={aviso_vol!r})",
            )

            # ── [8] VOLUME TAMBÉM PELA BARRA E PELO PAINEL ───────────────────
            print("\n[8] Player: os botões da barra e do painel mexem no volume")
            await page.evaluate(
                """() => {
                    const b = document.querySelector('[aria-label="Aumentar volume"]');
                    b.focus(); b.click();
                }"""
            )
            await page.wait_for_timeout(300)
            vol = await page.evaluate("() => window.__mfVol")
            checar(vol == 55, f"o botão da barra aumentou o volume ({vol})")

            # ── [9] BACK HIERÁRQUICO (config → controles → detalhes) ─────────
            print("\n[9] Player: BACK fecha configurações, depois controles, depois sai")
            # A hierarquia é: 1º BACK fecha as CONFIGURAÇÕES (a barra continua),
            # 2º BACK fecha a BARRA, 3º BACK sai do player. Fechar tudo de uma vez
            # no primeiro BACK seria o comportamento errado.
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(350)
            e = await estado(page)
            checar(not e["configAberto"], "1º BACK fechou as configurações")
            checar(
                e["controlesVisiveis"],
                "1º BACK NÃO fechou a barra de controles junto (hierarquia correta)",
            )

            await page.keyboard.press("Escape")
            await page.wait_for_timeout(400)
            e = await estado(page)
            checar(not e["configAberto"], "2º BACK: configurações continuam fechadas")
            checar(not e["controlesVisiveis"], "2º BACK fechou a barra de controles")

            url_antes = page.url
            await page.evaluate("() => document.querySelector('[data-tv-player-box]').focus()")
            await page.wait_for_timeout(200)
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(800)
            checar(
                page.url != url_antes and "/tv/assistir/" not in page.url,
                f"3º BACK saiu do player (url={page.url.split('#')[-1]})",
            )

            # ── [10] SEGURAR OK (~1s) FIXA OS CONTROLES ──────────────────────
            print("\n[10] Player: segurar OK ~1s FIXA os controles (não somem sozinhos)")
            # Depois do 3º BACK do passo [9] a rota já é /tv/titulo/1 e o React Router
            # guarda estado na MESMA página — voltar ao player por navegação de hash
            # não remonta a tela de forma confiável no teste. Uma PÁGINA NOVA é o que
            # garante o estado inicial limpo (é o que um usuário faria ao reabrir o app).
            page = await nav.new_page(viewport={"width": 1920, "height": 1080})
            page.on("pageerror", lambda e: erros.append(str(e)))
            await instalar_stubs(page)
            await page.goto(URL, wait_until="domcontentloaded")
            await page.wait_for_selector("[data-tv-player-box]", timeout=20000)
            await page.wait_for_timeout(2500)
            await page.evaluate("() => document.querySelector('[data-tv-player-box]').focus()")
            await page.wait_for_timeout(200)
            await page.keyboard.down("Enter")
            await page.wait_for_timeout(1300)
            await page.keyboard.up("Enter")
            await page.wait_for_timeout(300)
            e = await estado(page)
            checar(e["controlesVisiveis"], "após segurar OK os controles estão visíveis")
            fixo = await page.evaluate(
                "() => !!document.querySelector('.tv-player-overlay-fixo')"
            )
            checar(fixo, "os controles ficaram FIXOS (não somem por inatividade)")
            # Espera mais que o auto-hide: se estiver fixo, continua aberto.
            await page.wait_for_timeout(4600)
            e = await estado(page)
            checar(e["controlesVisiveis"], "os controles continuam abertos depois do auto-hide")

            # ══════════════════════════════════════════════════════════════════════
            # [10A] CORREÇÃO 5.0.1 — PAUSAR / RETOMAR / AVANÇAR / RETROCEDER
            #
            # O relato foi: "os controles da barra inferior do player NÃO respondem
            # ao controle remoto (D-pad) — os essenciais que não funcionam são
            # pausar, retomar, avançar e retroceder".
            #
            # Cada um deles é provado aqui pelo CAMINHO DO CONTROLE REMOTO, sem
            # nenhum clique de mouse:
            #   • pausar/retomar   → PLAY/PAUSE do controle (`mf-media-key`), que é o
            #     caminho que o shell nativo usa depois da correção;
            #   • avançar/retroceder SEGURANDO → seek CONTÍNUO (o gesto que faltava);
            #   • o OK do controle acionando o botão FOCADO da barra, com foco visível.
            # ══════════════════════════════════════════════════════════════════════
            page = await nav.new_page(viewport={"width": 1920, "height": 1080})
            page.on("pageerror", lambda e: erros.append(str(e)))
            await instalar_stubs(page)
            await page.goto(URL, wait_until="domcontentloaded")
            await page.wait_for_selector("[data-tv-player-box]", timeout=20000)
            await page.wait_for_timeout(2500)

            async def midia_key(tipo: str) -> None:
                """Uma tecla de MÍDIA do controle (é o evento que o shell nativo emite)."""
                await page.evaluate(
                    "(t) => window.dispatchEvent(new CustomEvent('mf-media-key', {detail: t}))",
                    tipo,
                )
                await page.wait_for_timeout(180)

            async def tecla_codigo(code: int, evento: str = "keydown", repeticao: bool = False) -> None:
                """
                Tecla CRUA do controle: só o keyCode, como o Android TV entrega.
                `key` vem como 'Unidentified' — é o que acontece na TV de verdade.
                """
                await page.evaluate(
                    """([code, tipo, rep]) => {
                        const ev = new KeyboardEvent(tipo, {bubbles: true, cancelable: true, repeat: rep});
                        Object.defineProperty(ev, 'keyCode', {get: () => code});
                        Object.defineProperty(ev, 'which', {get: () => code});
                        Object.defineProperty(ev, 'key', {get: () => 'Unidentified'});
                        window.dispatchEvent(ev);
                    }""",
                    [code, evento, repeticao],
                )

            # O embed é de outra origem: o stub devolve (eco) o comando que recebeu.
            await page.evaluate(
                """() => {
                    window.__mfEcoAll = [];
                    window.addEventListener('message', (ev) => {
                        if (ev.data && ev.data.mfEco) window.__mfEcoAll.push(ev.data.mfEco);
                    });
                }"""
            )

            async def conta(termo: str) -> int:
                return await page.evaluate(
                    """(n) => (window.__mfEcoAll || []).filter(
                        (m) => JSON.stringify(m).includes(n)).length""",
                    termo,
                )

            async def zera() -> None:
                await page.evaluate("() => { window.__mfEcoAll = []; }")

            # ── [10A.1] PAUSAR e RETOMAR pelo PLAY/PAUSE do controle ─────────────
            print("\n[10A.1] Player: PAUSAR e RETOMAR pelo controle remoto")
            await midia_key("togglePlay")
            e = await estado(page)
            checar("Pausado" in (e["aviso"] or ""), f"⏸ PAUSOU pelo controle (aviso={e['aviso']!r})")
            checar(await conta("pause") >= 1, "o comando 'pause' chegou ao player")

            await midia_key("togglePlay")
            e = await estado(page)
            checar("Reproduzindo" in (e["aviso"] or ""), f"▶ RETOMOU pelo controle (aviso={e['aviso']!r})")
            checar(await conta("play") >= 1, "o comando 'play' chegou ao player")

            await midia_key("togglePlay")
            await midia_key("togglePlay")
            checar(
                "Reproduzindo" in ((await estado(page))["aviso"] or ""),
                "pausar → retomar → pausar → retomar volta mesmo a reproduzir",
            )

            # ── [10A.2] O OK ACIONA O BOTÃO FOCADO, COM FOCO VISÍVEL ────────────
            print("\n[10A.2] Player: ↓ põe o FOCO num botão e o OK o aciona")
            await page.evaluate("() => document.querySelector('[data-tv-player-box]').focus()")
            await page.wait_for_timeout(300)
            await page.keyboard.press("ArrowDown")
            await page.wait_for_timeout(450)
            e = await estado(page)
            checar(e["controlesVisiveis"], "↓ abriu a barra de controles")

            foco = await page.evaluate(
                """() => {
                    const a = document.activeElement;
                    const r = a ? a.getBoundingClientRect() : null;
                    return {
                        tag: a ? a.tagName : null,
                        naBarra: !!a && !!a.closest?.('.tv-player-controls'),
                        rotulo: a && a.getAttribute ? a.getAttribute('aria-label') : null,
                        visivel: !!r && r.width > 0 && r.height > 0,
                    };
                }"""
            )
            checar(foco["tag"] == "BUTTON", f"o elemento ativo é um BUTTON ({foco['tag']})")
            checar(foco["naBarra"], f"o FOCO está num botão da BARRA ({foco['rotulo']!r})")
            checar(foco["visivel"], "o botão focado está VISÍVEL na tela (requisito do controle)")

            # "Foco visível" = o botão focado está DESTACADO em relação aos outros.
            destaque = await page.evaluate(
                """() => {
                    const barra = document.querySelector('.tv-player-controls');
                    const botoes = Array.from(barra.querySelectorAll('button'));
                    const ativo = document.activeElement;
                    const outro = botoes.find((b) => b !== ativo);
                    const ler = (el) => {
                        if (!el) return null;
                        const cs = getComputedStyle(el);
                        return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor,
                                cs.boxShadow, cs.transform, cs.backgroundColor,
                                cs.borderColor, cs.scale, cs.opacity].join('|');
                    };
                    return {ativo: ler(ativo), outro: ler(outro)};
                }"""
            )
            checar(
                destaque["ativo"] is not None and destaque["ativo"] != destaque["outro"],
                "o botão focado está DESTACADO dos demais (foco sempre visível)",
            )

            # AVANÇAR pelo OK, com o botão focado.
            await page.evaluate(
                """() => { const b = document.querySelector('[aria-label^="Avançar"]'); if (b) b.focus(); }"""
            )
            await zera()
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(400)
            checar(await conta("seekFwd") >= 1, "o OK acionou o botão AVANÇAR focado")

            # RETROCEDER pelo OK, com o botão focado.
            await page.evaluate(
                """() => { const b = document.querySelector('[aria-label^="Retroceder"]'); if (b) b.focus(); }"""
            )
            await zera()
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(400)
            checar(await conta("seekBack") >= 1, "o OK acionou o botão RETROCEDER focado")

            # DPAD_CENTER (23) e NUMPAD_ENTER (66) são o MESMO OK em TVs diferentes.
            for code, nome in ((23, "DPAD_CENTER (23)"), (66, "NUMPAD_ENTER (66) do TV Box")):
                await page.evaluate(
                    """() => { const b = document.querySelector('[aria-label^="Avançar"]'); if (b) b.focus(); }"""
                )
                await zera()
                await tecla_codigo(code)
                await page.wait_for_timeout(120)
                await tecla_codigo(code, "keyup")
                await page.wait_for_timeout(400)
                checar(await conta("seekFwd") >= 1, f"{nome} aciona o botão focado igual ao OK")

            # ── [10A.3] SEEK CONTÍNUO: SEGURAR avança/retrocede progressivamente ─
            print("\n[10A.3] Player: SEGURAR ⏩/⏪ avança/retrocede progressivamente")
            await page.evaluate("() => document.querySelector('[data-tv-player-box]').focus()")
            await page.wait_for_timeout(4600)  # auto-hide: estado de reprodução normal
            e = await estado(page)
            checar(not e["controlesVisiveis"], "controles fechados (estado normal de reprodução)")
            checar(e["focoNoPlayer"], "o foco está no player, pronto para o seek")

            # ── (a) ←/→ SEGURADAS: SEEK CONTÍNUO dirigido pelo próprio player ──
            # Vem PRIMEIRO: as teclas de MÍDIA do bloco (b) ABREM a barra de
            # controles (`mf-media-key` chama `mostrarControles`), e com a barra
            # aberta as setas NAVEGAM o foco em vez de fazer seek — de propósito.
            # Medir o seek depois delas seria medir o caminho errado.
            await zera()
            await page.keyboard.down("ArrowRight")
            await page.wait_for_timeout(1400)
            await page.keyboard.up("ArrowRight")
            n_segurou = await conta("seekFwd")
            checar(n_segurou >= 3, f"→ SEGURADO avança progressivamente ({n_segurou} passos em 1,4s)")

            await page.wait_for_timeout(1000)
            n_parou = await conta("seekFwd")
            checar(n_parou == n_segurou, f"ao SOLTAR o movimento PARA ({n_segurou} → {n_parou})")

            await zera()
            await page.keyboard.down("ArrowLeft")
            await page.wait_for_timeout(1400)
            await page.keyboard.up("ArrowLeft")
            n_volta = await conta("seekBack")
            checar(n_volta >= 3, f"← SEGURADO retrocede progressivamente ({n_volta} passos em 1,4s)")

            # O auto-repeat do TECLADO não pode dobrar o passo: um evento marcado
            # como repetição (`e.repeat`) NÃO dispara passo nenhum — quem cadencia
            # o movimento é o intervalo do próprio player.
            await zera()
            for _ in range(3):
                await tecla_codigo(39, "keydown", repeticao=True)
            await page.wait_for_timeout(300)
            n_rep = await conta("seekFwd")
            checar(n_rep == 0, f"um keydown de REPETIÇÃO não dispara passo extra ({n_rep} passos)")

            # ── (b) ⏩/⏪ SEGURADOS: a REPETIÇÃO do Android vira passos de seek ──
            # O Android repete o ACTION_DOWN enquanto a tecla está pressionada, e o
            # shell emite um `mf-media-key` por repetição. É o gesto "segurar para
            # frente/para trás" no botão do controle remoto.
            await zera()
            for _ in range(5):
                await midia_key("seekFwd")
            n_fwd = await conta("seekFwd")
            checar(n_fwd >= 5, f"⏩ SEGURADO avança em passos REPETIDOS ({n_fwd} passos)")

            await zera()
            for _ in range(5):
                await midia_key("seekBack")
            n_back = await conta("seekBack")
            checar(n_back >= 5, f"⏪ SEGURADO retrocede em passos REPETIDOS ({n_back} passos)")

            # ── [10A.4] REGRESSÃO: o que já funcionava continua funcionando ─────
            print("\n[10A.4] Player: mudo/volume e configurações continuam OK pelo controle")
            await page.evaluate("() => document.querySelector('[data-tv-player-box]').focus()")
            await page.wait_for_timeout(250)
            await page.evaluate(
                """() => {
                    window.__mfMudo2 = false; window.__mfVol2 = 50;
                    window.MovieFlixApp = Object.assign(window.MovieFlixApp || {}, {
                      ajustarVolume: (d) => { window.__mfVol2 = Math.min(100, Math.max(0, window.__mfVol2 + d)); },
                      definirVolume: (v) => { window.__mfVol2 = v; },
                      definirMudo: (m) => { window.__mfMudo2 = m; },
                      lerVolume: () => window.__mfVol2,
                      lerMudo: () => window.__mfMudo2,
                    });
                }"""
            )
            await tecla_codigo(164)
            await page.wait_for_timeout(320)
            checar(
                await page.evaluate("() => window.__mfMudo2") is True,
                "🔇 MUDO continua funcionando pelo controle (sem regressão)",
            )
            await tecla_codigo(164)
            await page.wait_for_timeout(320)
            checar(
                await page.evaluate("() => window.__mfMudo2") is False,
                "🔊 desmutar continua funcionando (sem regressão)",
            )
            await tecla_codigo(24)
            await page.wait_for_timeout(320)
            checar(
                await page.evaluate("() => window.__mfVol2") == 55,
                "o VOLUME + continua funcionando pelo controle (sem regressão)",
            )

            # O bloco de mídia acima ABRIU a barra de controles: volta ao estado
            # normal de reprodução (barra fechada) antes de testar o ↑ — com a
            # barra aberta a seta navega o foco, que é o comportamento correto.
            await page.evaluate("() => document.querySelector('[data-tv-player-box]').focus()")
            await page.wait_for_timeout(4700)
            checar(
                not (await estado(page))["controlesVisiveis"],
                "os controles fecharam sozinhos antes do teste do ↑ (auto-hide)",
            )

            await page.keyboard.press("ArrowUp")
            await page.wait_for_timeout(500)
            checar((await estado(page))["configAberto"], "↑ ainda abre as CONFIGURAÇÕES (sem regressão)")
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(300)

            # ── [11] ZERO ERROS DE JAVASCRIPT ────────────────────────────────
            print("\n[11] Nenhum erro de JavaScript ao operar o player")
            checar(not erros, f"nenhum erro de JS (erros={erros[:3]})")

            # ── Evidência visual ─────────────────────────────────────────────
            await page.wait_for_selector("[data-tv-player-box]", timeout=15000)
            await page.evaluate("() => document.querySelector('[data-tv-player-box]').focus()")
            await page.keyboard.press("ArrowDown")
            await page.wait_for_timeout(400)
            await page.screenshot(path=str(DIST / "_teste-player-tv.png"))
            print(f"\n  (screenshot) {DIST / '_teste-player-tv.png'}")

            await nav.close()
    finally:
        servidor.terminate()

    print("\n" + "=" * 64)
    print(f"RESULTADO: {len(ok)} OK / {len(falhas)} FALHA(S)")
    for f in falhas:
        print(f"  ✗ {f}")
    print("=" * 64)
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

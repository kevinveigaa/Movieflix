/**
 * Proxy de reprodução.
 *
 * Alguns provedores de vídeo enviam cabeçalhos (X-Frame-Options /
 * Content-Security-Policy: frame-ancestors) que impedem a reprodução dentro
 * do nosso site, causando tela branca ou "conexão recusada".
 *
 * Este módulo serve o conteúdo pelo nosso próprio domínio, removendo esses
 * bloqueios e reescrevendo os links internos para continuarem passando pelo
 * proxy — assim o player roda sempre dentro do site, sem abrir nada externo.
 */

const PROXY_PATH = "/api/player";

const HEADERS_BLOQUEADOS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "strict-transport-security",
]);

function urlValida(valor) {
  try {
    const u = new URL(valor);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

function paraProxy(valor, base) {
  if (!valor) return valor;
  const bruto = String(valor).trim();
  // Já está passando pelo proxy: não reescrever de novo (evita loop).
  if (bruto.startsWith(PROXY_PATH + "?url=")) return bruto;
  if (
    bruto.startsWith("data:") ||
    bruto.startsWith("blob:") ||
    bruto.startsWith("javascript:") ||
    bruto.startsWith("about:") ||
    bruto.startsWith("mailto:") ||
    bruto.startsWith("#")
  ) {
    return bruto;
  }
  try {
    const absoluta = new URL(bruto, base).toString();
    return `${PROXY_PATH}?url=${encodeURIComponent(absoluta)}`;
  } catch {
    return bruto;
  }
}

/** Script injetado: mantém tudo dentro do site e bloqueia saídas externas. */
function scriptDeContencao(base) {
  return `<script>(function(){
  var BASE=${JSON.stringify(base)};
  var P=${JSON.stringify(PROXY_PATH)};
  function px(u){
    try{
      if(u==null) return u;
      if(typeof u!=='string') u=String(u);
      if(/^(data:|blob:|javascript:|about:|#)/i.test(u)) return u;
      if(u.indexOf(P+'?url=')===0) return u;
      return P+'?url='+encodeURIComponent(new URL(u,BASE).toString());
    }catch(e){return u;}
  }
  window.open=function(){return null;};
  try{
    var _f=window.fetch;
    if(_f) window.fetch=function(i,o){ return _f(typeof i==='string'?px(i):i,o); };
    var _o=XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open=function(m,u){
      var a=[].slice.call(arguments); a[1]=px(u); return _o.apply(this,a);
    };
  }catch(e){}
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest?e.target.closest('a'):null;
    if(a&&a.target&&a.target!=='_self'){e.preventDefault();e.stopPropagation();}
  },true);
})();</script>`;
}

function reescreverHtml(html, base) {
  let saida = html
    // remove metatags de política que bloqueiam o embed
    .replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "")
    // remove <base> original para não quebrar a reescrita
    .replace(/<base[^>]*>/gi, "")
    .replace(/\s(src|href|action|poster|data-src)=("|')(.*?)\2/gi, (m, attr, aspas, valor) => {
      return ` ${attr}=${aspas}${paraProxy(valor, base)}${aspas}`;
    });

  const script = scriptDeContencao(base);
  if (/<head[^>]*>/i.test(saida)) {
    saida = saida.replace(/<head([^>]*)>/i, `<head$1>${script}`);
  } else {
    saida = script + saida;
  }
  return saida;
}

function registrarPlayerProxy(app) {
  app.all(PROXY_PATH, async (req, res) => {
    const alvo = urlValida(req.query.url || "");
    if (!alvo) {
      return res.status(400).json({ erro: "Endereço de reprodução inválido." });
    }

    // Nunca buscar o próprio site: isso renderizava o site dentro do site.
    const hostProprio = (req.get("host") || "").toLowerCase();
    if (alvo.host.toLowerCase() === hostProprio) {
      return res.status(400).json({ erro: "Endereço de reprodução inválido (mesmo domínio)." });
    }

    try {
      const upstream = await fetch(alvo.toString(), {
        method: req.method === "HEAD" ? "HEAD" : req.method,
        headers: {
          "user-agent": req.get("user-agent") || "Mozilla/5.0",
          accept: req.get("accept") || "*/*",
          "accept-language": req.get("accept-language") || "pt-BR,pt;q=0.9",
          referer: alvo.origin + "/",
          ...(req.get("range") ? { range: req.get("range") } : {}),
        },
        redirect: "follow",
      });

      const tipo = upstream.headers.get("content-type") || "";
      res.status(upstream.status);
      // Marca a resposta para deixar claro que veio do proxy (facilita depurar).
      res.set("X-Player-Proxy", "1");
      upstream.headers.forEach((valor, chave) => {
        if (!HEADERS_BLOQUEADOS.has(chave.toLowerCase())) res.set(chave, valor);
      });
      res.removeHeader("X-Frame-Options");
      res.removeHeader("Content-Security-Policy");

      if (tipo.includes("text/html")) {
        const html = await upstream.text();
        const base = upstream.url || alvo.toString();
        res.set("Content-Type", "text/html; charset=utf-8");
        return res.send(reescreverHtml(html, base));
      }

      if (tipo.includes("mpegurl") || tipo.includes("x-mpegURL")) {
        const texto = await upstream.text();
        const base = upstream.url || alvo.toString();
        const lista = texto
          .split("\n")
          .map((linha) => {
            const l = linha.trim();
            if (!l || l.startsWith("#")) {
              return l.replace(/URI="([^"]+)"/g, (m, u) => `URI="${paraProxy(u, base)}"`);
            }
            return paraProxy(l, base);
          })
          .join("\n");
        res.set("Content-Type", "application/vnd.apple.mpegurl");
        return res.send(lista);
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      return res.send(buffer);
    } catch (error) {
      console.log("ERRO PLAYER PROXY:", error.message);
      return res.status(502).json({ erro: "Não foi possível carregar a reprodução." });
    }
  });
}

module.exports = { registrarPlayerProxy, PROXY_PATH };

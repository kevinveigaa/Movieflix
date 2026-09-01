/**
 * otimizar-catalogo.cjs
 *
 * Gera versões OTIMIZADAS do catálogo (filmes.light.json / series.light.json)
 * removendo campos redundantes que NÃO são usados pelo frontend:
 *   - `player`  : duplicado de `video_url` (mesmo valor, nunca lido no src/)
 *   - `_ordem`  : metadado interno de geração, nunca lido no src/
 *
 * O frontend (src/hooks/useMovies.ts) passa a carregar os arquivos .light,
 * reduzindo o payload inicial do catálogo sem mudar a arquitetura nem quebrar
 * nenhuma tela (busca, catálogo, detalhes, TV, player usam os mesmos campos).
 *
 * Uso: node otimizar-catalogo.cjs
 * Saída: filmes/filmes.light.json e filmes/series.light.json
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'filmes');
const CAMPOS_REDUNDANTES = ['player', '_ordem'];

function otimizar(nome) {
  const origem = path.join(DIR, nome);
  const destino = path.join(DIR, nome.replace('.json', '.light.json'));
  if (!fs.existsSync(origem)) {
    console.log(`[skip] ${nome} não existe`);
    return;
  }
  const arr = JSON.parse(fs.readFileSync(origem, 'utf8'));
  const out = arr.map((m) => {
    const c = { ...m };
    for (const k of CAMPOS_REDUNDANTES) delete c[k];
    return c;
  });
  const antes = fs.statSync(origem).size;
  const depois = JSON.stringify(out).length;
  fs.writeFileSync(destino, JSON.stringify(out));
  console.log(
    `${nome}: ${(antes / 1024 / 1024).toFixed(2)}MB -> ${(depois / 1024 / 1024).toFixed(2)}MB  (-${((1 - depois / antes) * 100).toFixed(1)}%)`,
  );
}

otimizar('filmes.json');
otimizar('series.json');

// Copia os arquivos otimizados para public/filmes/ (servidos pelo build).
const PUBLIC_DIR = path.join(__dirname, 'public', 'filmes');
if (fs.existsSync(PUBLIC_DIR)) {
  for (const nome of ['filmes.light.json', 'series.light.json']) {
    const src = path.join(DIR, nome);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(PUBLIC_DIR, nome));
      console.log(`copiado para public/filmes/${nome}`);
    }
  }
}

console.log('Concluído.');
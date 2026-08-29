/**
 * Ordenação aleatória com PRIORIDADE PARA OS LANÇAMENTOS.
 *
 * Objetivo (pedido do dono): a Home, as categorias e a apresentação padrão do
 * catálogo nunca aparecem sempre na mesma sequência, mas os títulos mais novos
 * têm muito mais chance de aparecer no começo.
 *
 * Como funciona:
 *  - o peso vem do ANO REAL do título (campos já existentes no catálogo:
 *    `release_date` quando houver, senão `year`) — nenhuma propriedade nova é
 *    inventada e nenhum dado do filme é alterado;
 *  - o sorteio usa amostragem ponderada sem reposição (Efraimidis–Spirakis):
 *    chave = random^(1/peso), ordenada decrescente. Títulos recentes têm peso
 *    alto → tendem a ficar na frente, mas a ordem dentro de cada faixa (e
 *    entre faixas vizinhas) muda a cada carregamento;
 *  - o gerador é DETERMINÍSTICO a partir de uma semente (`criarSemente()`).
 *    A página cria a semente uma única vez ao montar e a usa dentro de
 *    `useMemo` — logo a lista NÃO muda de posição a cada re-render, só quando
 *    o usuário abre/recarrega a Home ou volta para ela numa nova navegação.
 */

/** PRNG determinístico (mulberry32) — rápido e suficiente para embaralhar UI. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semente nova por carregamento/montagem (use em useState(() => criarSemente())). */
export function criarSemente(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/** Ano de lançamento a partir dos campos REAIS do catálogo (release_date/year). */
export function anoDoTitulo(item: unknown): number {
  const o = (item ?? {}) as Record<string, unknown>;
  const bruto = o.release_date ?? o.first_air_date ?? o.year ?? null;
  if (!bruto) return 0;
  const ano = parseInt(String(bruto).slice(0, 4), 10);
  return Number.isFinite(ano) ? ano : 0;
}

/**
 * Peso por faixa de lançamento: quanto mais novo, maior a chance de aparecer
 * primeiro. Títulos sem ano conhecido entram com o peso mínimo.
 */
export function pesoPorRecencia(item: unknown, anoAtual = new Date().getFullYear()): number {
  const ano = anoDoTitulo(item);
  if (!ano) return 1;
  const idade = anoAtual - ano;
  if (idade <= 0) return 24; // lançamentos do ano corrente (e futuros)
  if (idade === 1) return 14;
  if (idade === 2) return 8;
  if (idade === 3) return 5;
  if (idade <= 5) return 3;
  if (idade <= 10) return 1.8;
  return 1;
}

/**
 * Embaralha priorizando os lançamentos. Não muta a lista original.
 * @param lista itens do catálogo (filmes/séries)
 * @param semente semente da sessão/página (criarSemente())
 */
export function embaralharPriorizandoRecentes<T>(lista: readonly T[], semente: number): T[] {
  if (lista.length <= 1) return [...lista];
  const rand = mulberry32(semente);
  const anoAtual = new Date().getFullYear();
  return lista
    .map((item) => {
      const peso = pesoPorRecencia(item, anoAtual);
      const u = Math.max(rand(), 1e-12);
      return { item, chave: Math.pow(u, 1 / peso) };
    })
    .sort((a, b) => b.chave - a.chave)
    .map((x) => x.item);
}

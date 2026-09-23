/**
 * MovieFlix TV — utilitários de seleção determinística.
 *
 * Serve apenas para ESCOLHER uma fatia do catálogo real para as linhas da Home
 * ("Em alta"). Nenhum dado é criado: as fatias saem do próprio catálogo do site.
 *
 * Por que determinístico: um shuffle aleatório mudaria a Home a cada render e
 * faria o foco do controle "pular" de lugar ao voltar para a tela. Com semente
 * fixa, a seleção é estável entre renders e sessões — mas diferente da ordem de
 * "Lançamentos", evitando que as duas linhas mostrem os mesmos títulos.
 */
export function embaralhar<T>(itens: T[], semente = 20260923): T[] {
  const arr = [...itens];
  let s = semente;
  for (let i = arr.length - 1; i > 0; i--) {
    // LCG simples — suficiente para variar a seleção, sem custo de entropia.
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

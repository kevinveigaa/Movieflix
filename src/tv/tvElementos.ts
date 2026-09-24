/**
 * MovieFlix TV — helpers de foco do D-pad compartilhados pelas telas de TV.
 *
 * POR QUE ESTE ARQUIVO EXISTE (causa raiz do BUG do login da TV):
 *
 * O login da TV mantém o foco em campos de texto / teclas do teclado na tela por
 * MUITO mais tempo do que as outras telas — o usuário fica vários segundos
 * digitando. Durante esse tempo, duas coisas precisam saber que "o foco é do
 * usuário e ninguém pode mexer":
 *
 *  1. a RECUPERAÇÃO AUTOMÁTICA DE FOCO do `TvLayout` (que tenta recuperar o foco
 *     no 250, 700, 1300, 2100 e 3200 ms depois do splash);
 *  2. a NAVEGAÇÃO ESPACIAL global (`useTvNavigation`), que consome setas e OK.
 *
 * Se qualquer uma das duas agir enquanto o usuário está digitando, o foco sai do
 * campo — exatamente o comportamento relatado ("coloco no campo e ele sai antes
 * de eu escrever"). Em vez de cada uma reimplementar a sua própria noção de "o
 * usuário está digitando" (foi assim que a recuperação automática continuava
 * agindo mesmo com o foco numa TECLA do teclado na tela, porque só reconhecia
 * INPUT/TEXTAREA), as duas usam os helpers daqui — que são a ÚNICA definição de:
 *
 *  • `ehCampoDeTexto`   — isto é um campo onde se digita?
 *  • `dentroDeFormularioTv` — o foco está num formulário de TV (data-tv-form)?
 *  • `focoDoUsuario`    — o foco está em algo que o USUÁRIO escolheu?
 */

import { ehCampoDeTexto } from '@/lib/tecladoTv';

/** O elemento é editável (input/textarea/contentEditable)? */
export { ehCampoDeTexto };

/** O elemento está dentro (ou é) um formulário de TV marcado com `data-tv-form`? */
export function dentroDeFormularioTv(el: Element | null | undefined): boolean {
  if (!el) return false;
  return el.closest?.('[data-tv-form]') != null;
}

/**
 * O foco está num CAMPO DE TEXTO de um formulário de TV?
 *
 * (Usado onde é preciso distinguir "o usuário está digitando" de "o usuário
 * está navegando pelas teclas do teclado na tela".)
 */
export function emFormularioTv(): boolean {
  const ativo = document.activeElement as HTMLElement | null;
  return !!ativo && ehCampoDeTexto(ativo) && dentroDeFormularioTv(ativo);
}

/**
 * O foco está em algo que o USUÁRIO escolheu — campo de texto, área editável ou
 * QUALQUER elemento dentro de um formulário de TV (inclusive as TECLAS do
 * teclado na tela e o botão que abre/fecha o teclado)?
 *
 * É o teste que a recuperação automática de foco do `TvLayout` usa para se
 * abster. Antes ele só reconhecia INPUT/TEXTAREA, então com o foco numa TECLA do
 * teclado na tela a recuperação continuava agindo: uma das tentativas (250, 700,
 * 1300, 2100 ou 3200 ms depois do splash) roubava o foco no meio da digitação, e
 * o vídeo do usuário mostra exatamente isso — o foco sai do campo/teclado e volta
 * para a coluna lateral.
 */
export function focoDoUsuario(): boolean {
  const ativo = document.activeElement as HTMLElement | null;
  if (!ativo || ativo === document.body) return false;
  if (dentroDeFormularioTv(ativo)) return true;
  const tag = ativo.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || ativo.isContentEditable === true;
}

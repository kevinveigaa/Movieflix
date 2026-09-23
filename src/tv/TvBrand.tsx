/**
 * MovieFlix TV — elementos da MARCA.
 *
 * Reutiliza os assets OFICIAIS do site (public/logo.png e public/icon-512.png),
 * os mesmos que o Mobile/Web usam. Nada é redesenhado nem substituído por texto.
 */

/**
 * Logo oficial completa (símbolo "M" + wordmark MOVIEFLIX).
 * Arquivo: public/logo.png — idêntico ao usado pelo site e pelo app Mobile.
 */
export function TvLogo({ className }: { className?: string }) {
  return <img src="/logo.png" alt="MovieFlix" className={className} draggable={false} />;
}

/**
 * Símbolo "M" da marca (ícone do aplicativo), para espaços reduzidos como o
 * player — nunca usamos a palavra "MOVIEFLIX" escrita como identificação.
 */
export function TvMark({ className }: { className?: string }) {
  return <img src="/icon-512.png" alt="MovieFlix" className={className} draggable={false} />;
}

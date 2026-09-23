import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

/**
 * Estados compartilhados da TV (carregando / erro / vazio).
 *
 * Nunca escondemos um erro de carregamento atrás de uma mensagem de "lista
 * vazia": o erro mostra a causa e oferece "Tentar novamente". E um erro de
 * dados NÃO oferece um caminho que simplesmente ignora o catálogo — antes havia
 * um botão que mandava o usuário para a Home sem catálogo, mascarando a falha.
 */

export function TvLoading({ label = 'Carregando o catálogo MovieFlix...' }: { label?: string }) {
  return (
    <div className="tv-page-center">
      <div className="tv-loading">
        <div className="tv-loading-spinner" />
        <p>{label}</p>
      </div>
    </div>
  );
}

export function TvErroCatálogo({ mensagem, onTentarNovamente }: { mensagem?: string; onTentarNovamente?: () => void }) {
  return (
    <div className="tv-page-center">
      <div className="tv-error">
        <AlertTriangle className="tv-icon-lg" style={{ color: '#df0a15' }} />
        <h2>Não foi possível carregar o catálogo</h2>
        <p>
          {mensagem ||
            'O catálogo é a mesma fonte usada pelo site e pelo aplicativo MovieFlix. Verifique a conexão da TV e tente novamente.'}
        </p>
        {onTentarNovamente ? (
          <div className="tv-error-actions">
            <button
              data-tv-focusable
              tabIndex={0}
              className="tv-btn tv-btn-primary"
              onClick={onTentarNovamente}
            >
              <RefreshCw className="tv-icon" />
              Tentar novamente
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Lista genuinamente vazia (ex.: busca sem resultado) — estado NEUTRO, sem
 * sugestão de entrar no catálogo (isso pertencia ao bug antigo de catálogo
 * vazio: o app mandava o usuário "continuar para o catálogo" quando na
 * verdade o catálogo não estava carregando).
 */
export function TvVazio({ titulo, mensagem }: { titulo: string; mensagem?: string }) {
  return (
    <div className="tv-page-center">
      <div className="tv-error tv-error-muted">
        <h2>{titulo}</h2>
        {mensagem ? <p>{mensagem}</p> : null}
      </div>
    </div>
  );
}

/** Spinner pequeno, para uso dentro de uma seção. */
export function TvSpinner() {
  return <Loader2 className="tv-icon tv-spin" />;
}

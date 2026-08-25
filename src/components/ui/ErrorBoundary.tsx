import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  titulo?: string;
}

interface State {
  erro: Error | null;
}

/**
 * Evita "tela preta": se algo quebrar dentro deste bloco, mostramos a mensagem
 * do erro no lugar de derrubar o app inteiro.
 *
 * IMPORTANTE: o App usa <ErrorBoundary key={location.pathname}> — quando a rota
 * muda, o React REMONTA o boundary (state resetado), então o erro de uma página
 * não contamina a próxima. O botão "Tentar de novo" continua funcionando.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', erro, info);
  }

  render() {
    const { erro } = this.state;
    if (erro) {
      return (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
          <p className="font-bold">{this.props.titulo ?? 'Algo deu errado nesta seção.'}</p>
          <p className="mt-2 break-words text-red-300/90">{erro.message}</p>
          <button
            onClick={() => this.setState({ erro: null })}
            className="mt-4 rounded-lg border border-red-400/40 px-3 py-2 text-xs hover:bg-red-500/20"
          >
            Tentar de novo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

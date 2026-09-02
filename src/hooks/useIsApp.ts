import { useEffect, useState } from 'react';
import { rodandoNoApp } from '@/lib/appShell';

/**
 * useIsApp — detecta se o site está rodando DENTRO do app nativo (APK/Capacitor)
 * ou num navegador comum.
 *
 * Regra de produto (IMPORTANTE):
 *  - APP  → reproduz vídeo normalmente (player funciona).
 *  - SITE → NÃO reproduz vídeo. Ao clicar em "Assistir", mostra a tela
 *           "Assista pelo aplicativo" (convite para abrir/baixar o app).
 *
 * Retorna `true` quando dentro do app, `false` quando navegador, e `null`
 * enquanto a detecção ainda não terminou (evita flash de tela errada).
 */
export function useIsApp(): boolean | null {
  const [isApp, setIsApp] = useState<boolean | null>(null);

  useEffect(() => {
    let ativo = true;
    rodandoNoApp().then((v) => {
      if (ativo) setIsApp(v);
    });
    return () => {
      ativo = false;
    };
  }, []);

  return isApp;
}
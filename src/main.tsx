import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './tv/tv.css';

// BUILD_ID: 20260822-1606-force-rebuild-v3
console.log('[MovieFlix] Build v3 — fallback automático ativado');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: registra o service worker apenas em produção (evita cache "preso" no dev).
// Em TVs e TV Box o app costuma ficar aberto por muito tempo, então forçamos a
// checagem de atualização e recarregamos assim que uma nova versão assume.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Procura atualização agora e a cada 30 minutos.
        registration.update().catch(() => undefined);
        window.setInterval(() => registration.update().catch(() => undefined), 30 * 60 * 1000);

        registration.addEventListener('updatefound', () => {
          const novo = registration.installing;
          if (!novo) return;
          novo.addEventListener('statechange', () => {
            if (novo.state === 'installed' && navigator.serviceWorker.controller) {
              novo.postMessage('SKIP_WAITING');
            }
          });
        });
      })
      .catch(() => {
        // Ignora falhas de registro silenciosamente.
      });

    let recarregando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recarregando) return;
      recarregando = true;
      window.location.reload();
    });
  });
}

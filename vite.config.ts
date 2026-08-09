import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        // Divide bibliotecas pesadas em chunks próprios para melhor cache e
        // carregamento inicial menor. hls.js só é usado no player (rota
        // /assistir), vidstack/plyr ainda não são importados no código atual.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'supabase-vendor': ['@supabase/supabase-js'],
          hls: ['hls.js'],
          vidstack: ['vidstack', '@vidstack/player', '@vidstack/react'],
          plyr: ['plyr', 'plyr-react'],
        },
      },
    },
  },
  server: {
    proxy: {
      // Em desenvolvimento, redireciona as chamadas do proxy TMDB para o
      // backend local (backend/server.js). Em produção, aponte VITE_API_URL
      // para o domínio do backend ou configure o roteador para /api.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});

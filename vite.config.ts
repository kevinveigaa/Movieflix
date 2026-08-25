import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

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
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // ANTIGO manualChunks removido: o formato de objeto fazia o Rollup
        // embutir uma SEGUNDA cópia do React dentro do 'query-vendor' (ciclo
        // react <-> @tanstack/react-query), causando "Class constructor S
        // cannot be invoked without 'new'" na página de pesquisa e em reload
        // direto de rotas internas. Sem manualChunks, o Vite/Rollup faz o
        // code-splitting automático com instância ÚNICA de React.
        // Prioridade: estabilidade > otimização de nomes de chunk.
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});

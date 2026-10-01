import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuracion de Vite: proxy a backend Express en puerto 3001
export default defineConfig({
  plugins: [react()],
  // base relativa: permite abrir dist/index.html desde file:// en el Electron
  // empaquetado y conserva las imagenes/public en rutas relativas.
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Solo /api: los archivos ya no se sirven desde el disco, viven en Atlas
      // y el backend los expone por /api/archivos/...
      '/api': 'http://localhost:3001'
    }
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500
  }
});
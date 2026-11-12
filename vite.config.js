import { defineConfig } from 'vite';

export default defineConfig({
  // Относительные пути, чтобы сборку можно было выложить в любую подпапку (GitHub Pages и т.п.)
  base: './',
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages serves the site from /<repo>/, so production builds use that base path.
// The dev server keeps '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/warehouse-dashboard/' : '/',
  plugins: [react(), tailwindcss()],
  server: { port: 5173, open: false },
}));

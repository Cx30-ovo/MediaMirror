import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { integrationPlugin } from './server/integration.mjs';
export default defineConfig({
  plugins: [react(), integrationPlugin()],
  server: { port: 5182, strictPort: true },
  preview: { port: 5182, strictPort: true },
});

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { simulationProxy } from './scripts/simulationProxy';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), simulationProxy()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', testTimeout: 60_000 },
});

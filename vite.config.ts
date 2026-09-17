import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import { learnWebRetrievalPlugin } from './src/infrastructure/web/webServerPlugin';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), learnWebRetrievalPlugin()],
    server: {
      // HMR and file watching can be turned off via the DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching to save CPU when HMR is off.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api/deepseek': {
          target: 'https://api.deepseek.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/deepseek/, ''),
        },
      },
    },
  };
});

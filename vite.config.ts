import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {readBoundedInteger} from './src/services/apiPolicy';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const host = env.VITE_HOST || '127.0.0.1';
  const port = readBoundedInteger(env, 'PORT', 3001, 1, 65535);
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host,
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${port}`,
          changeOrigin: false,
        },
      },
    },
    preview: { host },
  };
});

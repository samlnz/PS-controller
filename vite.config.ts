
import { defineConfig, loadEnv } from 'vite';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    define: {
      'process.env': {
        ADMIN_PASSWORD: env.ADMIN_PASSWORD || 'admin123',
        API_KEY: env.API_KEY,
      }
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
    }
  };
});

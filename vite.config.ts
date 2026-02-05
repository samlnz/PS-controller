
import { defineConfig, loadEnv } from 'vite';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    define: {
      'process.env': {
        ADMIN_PASSWORD: env.ADMIN_PASSWORD,
        API_KEY: env.API_KEY,
        BACKEND_URL: env.BACKEND_URL || ''
      }
    },
    build: {
      outDir: 'dist',
    }
  };
});

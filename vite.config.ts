
import { defineConfig, loadEnv } from 'vite';
import { cwd } from 'node:process';

export default defineConfig(({ mode }) => {
  // Use the explicitly imported cwd function from node:process to avoid 
  // typing conflicts with global process definitions in the Vite environment.
  const env = loadEnv(mode, cwd(), '');
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

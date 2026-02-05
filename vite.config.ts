import { defineConfig, loadEnv } from 'vite';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all envs regardless of the `VITE_` prefix.
  // Fix: Import 'process' from 'node:process' to ensure the 'cwd' method is available and typed correctly.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    define: {
      'process.env': {
        ADMIN_PASSWORD: env.ADMIN_PASSWORD,
        API_KEY: env.API_KEY
      }
    },
    build: {
      outDir: 'dist',
    }
  };
});

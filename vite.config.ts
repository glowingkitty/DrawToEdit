import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // Check for VITE_GEMINI_API_KEY first (Vite convention), fallback to GEMINI_API_KEY
  const apiKey = env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY;
  
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [svelte()],
    define: {
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
      // Expose to client via import.meta.env (Vite convention)
      // Vite automatically exposes VITE_* variables, but we also define it explicitly
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(apiKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});


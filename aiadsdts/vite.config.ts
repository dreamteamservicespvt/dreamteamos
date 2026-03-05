import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Load from .env files (for local development)
    const env = loadEnv(mode, '.', '');
    
    // On Netlify, process.env is populated at build time
    // Locally, loadEnv reads from .env files
    // We check both sources, prioritizing process.env (Netlify)
    const p = process.env;
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Legacy single API key
        'process.env.API_KEY': JSON.stringify(p.GEMINI_API_KEY || p.API_KEY || env.GEMINI_API_KEY || env.API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(p.GEMINI_API_KEY || env.GEMINI_API_KEY || ''),
        // Multiple API keys for automatic fallback
        'process.env.API_KEY_1': JSON.stringify(p.API_KEY_1 || env.API_KEY_1 || ''),
        'process.env.API_KEY_2': JSON.stringify(p.API_KEY_2 || env.API_KEY_2 || ''),
        'process.env.API_KEY_3': JSON.stringify(p.API_KEY_3 || env.API_KEY_3 || ''),
        'process.env.API_KEY_4': JSON.stringify(p.API_KEY_4 || env.API_KEY_4 || ''),
        'process.env.API_KEY_5': JSON.stringify(p.API_KEY_5 || env.API_KEY_5 || ''),
        'process.env.API_KEY_6': JSON.stringify(p.API_KEY_6 || env.API_KEY_6 || ''),
        'process.env.API_KEY_7': JSON.stringify(p.API_KEY_7 || env.API_KEY_7 || ''),
        'process.env.API_KEY_8': JSON.stringify(p.API_KEY_8 || env.API_KEY_8 || ''),
        'process.env.API_KEY_9': JSON.stringify(p.API_KEY_9 || env.API_KEY_9 || ''),
        'process.env.API_KEY_10': JSON.stringify(p.API_KEY_10 || env.API_KEY_10 || ''),
        'process.env.API_KEY_11': JSON.stringify(p.API_KEY_11 || env.API_KEY_11 || ''),
        'process.env.API_KEY_12': JSON.stringify(p.API_KEY_12 || env.API_KEY_12 || ''),
        'process.env.API_KEY_13': JSON.stringify(p.API_KEY_13 || env.API_KEY_13 || ''),
        'process.env.API_KEY_14': JSON.stringify(p.API_KEY_14 || env.API_KEY_14 || ''),
        'process.env.API_KEY_15': JSON.stringify(p.API_KEY_15 || env.API_KEY_15 || ''),
        'process.env.API_KEY_16': JSON.stringify(p.API_KEY_16 || env.API_KEY_16 || ''),
        'process.env.API_KEY_17': JSON.stringify(p.API_KEY_17 || env.API_KEY_17 || ''),
        'process.env.API_KEY_18': JSON.stringify(p.API_KEY_18 || env.API_KEY_18 || ''),
        'process.env.API_KEY_19': JSON.stringify(p.API_KEY_19 || env.API_KEY_19 || ''),
        'process.env.API_KEY_20': JSON.stringify(p.API_KEY_20 || env.API_KEY_20 || ''),
        'process.env.API_KEY_21': JSON.stringify(p.API_KEY_21 || env.API_KEY_21 || ''),
        'process.env.API_KEY_22': JSON.stringify(p.API_KEY_22 || env.API_KEY_22 || ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

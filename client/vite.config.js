import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 開發時將 /api 請求轉發到後端 Express server，避免 CORS/API Key 曝露問題
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5174',
        changeOrigin: true
      }
    }
  }
});

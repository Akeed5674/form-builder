import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // This allows any free ngrok domain to access your dev server
    allowedHosts: ['.ngrok-free.app'],
  },
});
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const proxy = {
  '/api': 'http://127.0.0.1:8080',
  '/otlp': {
    target: 'http://127.0.0.1:4318',
    rewrite: (path) => path.replace(/^\/otlp/, ''),
  },
};

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', proxy },
});

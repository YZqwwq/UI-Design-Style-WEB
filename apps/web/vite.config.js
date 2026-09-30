import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
function port(value, fallback) {
  const number = Number(value || fallback);
  if (!Number.isInteger(number) || number < 1 || number > 65535) throw new Error('WEB_PORT / API_PORT 必须是有效端口');
  return number;
}
const webPort = port(process.env.WEB_PORT, 4173);
const apiPort = port(process.env.API_PORT, 4174);
if (webPort === apiPort) throw new Error('WEB_PORT 与 API_PORT 不能相同');

export default defineConfig({
  root,
  plugins: [tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Keep the root database .env out of Vite's environment loading and file serving.
  envDir: root,
  server: {
    host: '127.0.0.1',
    port: webPort,
    strictPort: true,
    fs: { strict: true, allow: [root] },
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}` } },
  },
  build: {
    outDir: 'dist', emptyOutDir: true,
    rolldownOptions: {
      onwarn(warning, defaultHandler) {
        // This workspace is entirely client-rendered; RSC boundary directives are not needed.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
        defaultHandler(warning);
      },
    },
  },
});

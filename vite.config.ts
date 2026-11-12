import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';
const apiTarget = process.env.DAUYS_API_TARGET || 'http://127.0.0.1:8080';

export default defineConfig({
  resolve: {alias: {'@': fileURLToPath(new URL('./src', import.meta.url))}},
  plugins: [react(), tailwind()],
  server: {proxy: {'/api': {target: apiTarget, changeOrigin: true}}},
  preview: {proxy: {'/api': {target: apiTarget, changeOrigin: true}}},
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id) || id.includes('commonjsHelpers')) return 'react-vendor';
          // Keep the registry's Motion runtime with the lazy chart, off the initial page.
          if (id.includes('/node_modules/motion/')) return 'bklit-motion';
          if (/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(id)) return 'motion';
          // Environment's optional gainmap decoder must stay beside Three to avoid a chunk cycle.
          if (/node_modules\/(three|three-stdlib|@react-three\/[^/]+|@monogrid\/gainmap-js)\//.test(id)) return 'three';
        },
      },
    },
  },
});

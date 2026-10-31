import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [tailwindcss(), react()],
  build: {
    // GitHub Pages branch deploys only serve / (root) or /docs — build into docs/.
    outDir: 'docs',
    target: 'es2022',
  },
})

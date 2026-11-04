import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    // Vendor code changes rarely; separate chunks stay cached across app deploys.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](\.pnpm[\\/])?(react|react-dom|scheduler|react-router|react-router-dom)[@\\/]/ },
            { name: 'supabase', test: /node_modules[\\/].*@supabase/ },
          ],
        },
      },
    },
  },
})

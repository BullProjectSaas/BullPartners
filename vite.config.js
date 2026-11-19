import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relativa: funciona en GitHub Pages bajo /<repo>/ sin configurar nada.
export default defineConfig({ plugins: [react()], base: './' })

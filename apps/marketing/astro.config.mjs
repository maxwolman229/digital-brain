import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import vercel from '@astrojs/vercel'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://md1.app',
  adapter: vercel({
    includeFiles: ['./src/danieli-html/danieli-md1-ontology-and-kcards_7_1-v0.html'],
  }),
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
})

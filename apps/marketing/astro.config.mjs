import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import vercel from '@astrojs/vercel'

export default defineConfig({
  site: 'https://md1.app',
  adapter: vercel(),
  integrations: [
    sitemap({
      filter: (page) => !new URL(page).pathname.startsWith('/danieli'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})

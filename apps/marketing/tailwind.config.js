export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        md1: {
          navy: '#12233A',
          deep: '#0d1a2c',
          paper: '#F4F1EC',
          paper2: '#ECE7DE',
          ink: '#12233A',
          muted: 'rgba(18,35,58,0.62)',
          border: '#D4CDC0',
          accent: '#E8B547',
        },
      },
    },
  },
}

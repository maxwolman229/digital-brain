/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: '#062044',
        'warm-bg': '#f4f1ed',
        border: '#D8CEC3',
        teal: '#4FA89A',
        'text-main': '#1F1F1F',
        'text-muted': '#8a8278',
        'text-faint': '#b0a898',
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", 'sans-serif'],
        mono: ["'IBM Plex Mono'", 'monospace'],
      },
    },
  },
  plugins: [],
}

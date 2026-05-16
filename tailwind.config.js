/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        trench: {
          black: '#000',
          canvas: '#0a0907',
          panel: '#0f0e0b',
          line: 'rgba(240, 240, 240, 0.12)',
          accent: '#d4ff3e',
        },
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
        serif: ['Instrument Serif', 'ui-serif', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

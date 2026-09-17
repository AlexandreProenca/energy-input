/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'ui-monospace', 'monospace'] },
      colors: {
        brand: { 50: '#eef8f3', 100: '#d5efe2', 200: '#abdfc6', 300: '#77c8a4', 400: '#44ab80', 500: '#248f66', 600: '#187352', 700: '#145c43', 800: '#124a37', 900: '#0f3d2e' },
        sun: { 400: '#f6b73c', 500: '#ee9b1a' },
      },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,.04), 0 4px 16px rgba(16,24,40,.06)' },
    },
  },
  plugins: [],
};

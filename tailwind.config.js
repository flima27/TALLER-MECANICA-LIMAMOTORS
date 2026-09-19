/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#16212c', 800: '#1d2b3a', 700: '#26374a', 600: '#35485e' },
        steel: { 50: '#f4f6f8', 100: '#e8ecf0', 200: '#d3dae1', 300: '#b4bfca', 400: '#8896a5', 500: '#647383', 600: '#4a5866' },
        amber: { 50: '#fff8e6', 100: '#ffefc2', 200: '#ffe08a', 300: '#ffcd4d', 400: '#fbb81f', 500: '#f2a20c', 600: '#d18305', 700: '#a86206' },
      },
      fontFamily: {
        sans: ['Barlow', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Barlow', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

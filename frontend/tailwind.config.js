/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0F766E',
        secondary: '#0EA5E9',
        surface: '#0B1120',
        accent: '#F97316',
      },
    },
  },
  plugins: [],
}

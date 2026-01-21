/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './contexts/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Minty color palette
        mint: {
          50: '#f0fdf9',
          100: '#ADEED9',
          200: '#8DE8D0',
          300: '#56DFCF',
          400: '#2DD4BF',
          500: '#0ABAB5',
          600: '#089E9A',
          700: '#067A77',
          800: '#055B59',
          900: '#043D3C',
          950: '#022523',
        },
        blush: {
          50: '#FFEDF3',
          100: '#FFD6E4',
          200: '#FFB8D0',
          300: '#FF8AB4',
          400: '#FF5C98',
          500: '#FF2E7C',
        },
        gray: {
          950: '#0a0f0e',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'slide-in-right': 'slideInRight 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}

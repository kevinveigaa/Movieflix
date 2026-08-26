/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '400px',
      },
      colors: {
        brand: {
          50: '#fff1f1',
          100: '#ffe0e0',
          200: '#ffc6c6',
          300: '#ff9d9d',
          400: '#ff6464',
          500: '#ff2d2d',
          600: '#DF0A15',
          700: '#c40000',
          800: '#a30000',
          900: '#860000',
          950: '#4d0000',
        },
        ink: {
          50: '#f5f5f5',
          100: '#e7e7e7',
          200: '#c9c9c9',
          300: '#a3a3a3',
          400: '#737373',
          500: '#525252',
          600: '#3a3a3a',
          700: '#262626',
          800: '#171717',
          900: '#0d0d0d',
          950: '#050505',
        },
        roxo: {
          50: '#f6f2ff',
          100: '#ede8ff',
          200: '#ddd4ff',
          300: '#c4b1fe',
          400: '#a485fc',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6202BD',
          800: '#4c0a8f',
          900: '#3b0870',
          950: '#2e1065',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Bebas Neue"', 'Inter', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-fast': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(223,10,21,0.45)' },
          '50%': { boxShadow: '0 0 0 12px rgba(124,58,237,0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out both',
        'fade-in-fast': 'fade-in-fast 0.25s ease-out both',
        'scale-in': 'scale-in 0.2s ease-out both',
        shimmer: 'shimmer 1.6s infinite linear',
        'pulse-glow': 'pulse-glow 2s infinite',
      },
    },
  },
  plugins: [],
};

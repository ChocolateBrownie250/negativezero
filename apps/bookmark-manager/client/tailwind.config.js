/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sf: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'SF Pro Display',
          'Helvetica Neue',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        bg: '#0a0a0d',
        card: '#1c1c1e',
        surface: '#2c2c2e',
        raised: '#3a3a3c',
        raisedHover: '#48484a',
        accent: '#0A84FF',
        danger: '#FF453A',
        success: '#30D158',
      },
    },
  },
  plugins: [],
};

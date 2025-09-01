// tailwind.config.cjs
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:'#eef5ff',100:'#dbe9ff',200:'#bcd4ff',300:'#8fb6ff',
          400:'#5f8dff',500:'#3b66f6',600:'#2f51c6',700:'#2742a1',
          800:'#20377f',900:'#1b2f68'
        }
      },
      boxShadow: { card: '0 6px 18px rgba(0,0,0,.06)' },
      fontFamily: { sans: ['Inter','ui-sans-serif','system-ui','sans-serif'] }
    }
  },
  plugins: []
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        vert: {
          principal: '#059669',
          fonce: '#064e3b',
          clair: '#ecfdf5',
          tag: '#d1fae5',
        },
        orange: {
          principal: '#c8872a',
          clair: '#fff5ee',
          tag: '#fff0e0',
        },
        fond: {
          creme: '#fdf6ec',
          clair: '#f9f5f0',
        },
        texte: '#2c2c2c',
      },
      fontFamily: {
        sans: ['Lato', 'sans-serif'],
        serif: ['"Playfair Display"', 'serif'],
      },
      borderRadius: {
        'xl': '20px',
        '2xl': '30px',
      },
      boxShadow: {
        card: '0 4px 15px rgba(0,0,0,0.07)',
        'card-hover': '0 10px 30px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
}
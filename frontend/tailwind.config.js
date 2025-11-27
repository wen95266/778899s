/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        animation: {
          'pop-up': 'popUp 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
          'shimmer': 'shimmer 2.5s linear infinite',
          'pulse-slow': 'pulse 3s infinite',
        },
        keyframes: {
          popUp: {
            '0%': { opacity: '0', transform: 'scale(0.5) translateY(20px)' },
            '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
          },
          shimmer: {
            '0%': { transform: 'translateX(-100%) skewX(-12deg)' },
            '100%': { transform: 'translateX(200%) skewX(-12deg)' },
          }
        }
      },
    },
    plugins: [],
  }
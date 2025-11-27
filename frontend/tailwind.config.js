/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          redBall: '#ff4d4f',
          blueBall: '#4096ff',
          greenBall: '#52c41a',
        }
      },
    },
    plugins: [],
  }
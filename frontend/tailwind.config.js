/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 自定义波色颜色
        red: {
          500: '#ef4444',
          600: '#dc2626',
          900: '#7f1d1d',
        },
        blue: {
          500: '#3b82f6',
          600: '#2563eb',
          900: '#1e3a8a',
        },
        emerald: {
          500: '#10b981',
          600: '#059669',
          900: '#064e3b',
        }
      }
    },
  },
  plugins: [],
}
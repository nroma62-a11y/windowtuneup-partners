/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: { colors: { brand: { blue: '#007BFF', ink: '#1C1C1C' } }, boxShadow: { soft: '0 12px 40px rgba(15, 23, 42, .07)' } } },
  plugins: []
};
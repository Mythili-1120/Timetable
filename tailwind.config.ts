import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F2F4FD',
          100: '#E4E7FA',
          200: '#CCD2F5',
          300: '#A9B3ED',
          400: '#7E8CE1',
          500: '#5362D4',
          600: '#3431B7',
          700: '#28229E',
          800: '#201A83',
          900: '#171363',
          950: '#0E0C42',
        },
        ssm: {
          navy: '#201A83',
          blue: '#3431B7',
          slate: '#0F172A',
          surface: '#F4F5FB',
          border: '#E3E5F0',
          accent: '#4C46D9'
        }
      },
    },
  },
  plugins: [],
};

export default config;


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
          50: '#f0f5ff',
          100: '#e0ecff',
          200: '#c7dcff',
          300: '#9ec2ff',
          400: '#6ea0ff',
          500: '#3b78ff',
          600: '#1d55f7',
          700: '#1741e2',
          800: '#1936b8',
          900: '#1a3291',
          950: '#131e57',
        },
        ssm: {
          navy: '#1e3a8a',
          blue: '#2563eb',
          slate: '#0f172a',
          surface: '#f8fafc',
          border: '#e2e8f0',
          accent: '#0284c7'
        }
      },
    },
  },
  plugins: [],
};

export default config;


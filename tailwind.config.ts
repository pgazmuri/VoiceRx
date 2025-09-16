import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'Geist',
          'Mona Sans',
          'IBM Plex Sans',
          'Manrope',
          'ui-sans-serif',
          'system-ui'
        ],
      },
      colors: {
        brand: {
          DEFAULT: '#2563eb',
          foreground: '#ffffff'
        }
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(-100%)' }
        }
      },
      animation: {
        ticker: 'ticker 12s linear infinite'
      }
    }
  },
  plugins: [animate]
};

export default config;

import type { Config } from 'tailwindcss';

export default {
  content: [
    './popup.html',
    './onboarding.html',
    './src/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        dyslexic: ['OpenDyslexic', 'sans-serif'],
      },
      colors: {
        ni: {
          adhd: '#fefefe',
          autism: '#f5f0e8',
          dyslexia: '#fdf6e3',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

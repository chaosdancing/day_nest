import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#f1ece1',
          dark: '#e6dcc6',
        },
        ink: '#2b2418',
        kraft: {
          DEFAULT: '#a88a5c',
          dark: '#8b6e44',
          light: '#c9b288',
        },
        pin: {
          red: '#d23b3b',
          blue: '#3b6ed2',
          yellow: '#d2b03b',
          green: '#3bd271',
        },
      },
      fontFamily: {
        serif: ['"Source Han Serif SC"', '"Songti SC"', '"Times New Roman"', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        hand: ['Caveat', '"Permanent Marker"', '"Brush Script MT"', 'cursive'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        polaroid: '0 8px 24px rgba(0, 0, 0, 0.18)',
        'polaroid-hover': '0 20px 40px rgba(0, 0, 0, 0.28)',
        pin: '0 2px 3px rgba(0, 0, 0, 0.5)',
      },
      backgroundImage: {
        'paper-texture':
          "radial-gradient(circle at 20% 30%, rgba(170, 140, 90, 0.10) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(120, 90, 50, 0.08) 0%, transparent 40%)",
        'cork-board':
          "repeating-linear-gradient(45deg, rgba(150, 100, 60, 0.05) 0 2px, transparent 2px 4px), radial-gradient(circle at 30% 30%, #d6b483 0%, #b5905a 100%)",
      },
    },
  },
  plugins: [],
};

export default config;

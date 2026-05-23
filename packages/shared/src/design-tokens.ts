export type ThemeMode = 'light' | 'dark' | 'system';

export const tokens = {
  paper: {
    cream: '#FBF4E4',
    aged: '#F3E6CB',
    sepia: '#A88B5C',
  },
  ink: {
    primary: '#2A2520',
    secondary: '#6E5F4E',
    sticker: '#D4523A',
  },
  shadow: {
    polaroid: '0 2px 4px rgba(0,0,0,.08), 0 8px 20px rgba(0,0,0,.12)',
    sticker: '0 1px 2px rgba(0,0,0,.15)',
  },
  dark: {
    paper: {
      cream: '#1C1A17',
      aged: '#2A2520',
      sepia: '#6E5F4E',
    },
    ink: {
      primary: '#F3E6CB',
      secondary: '#A88B5C',
      sticker: '#E07A60',
    },
  },
} as const;

export type Tokens = typeof tokens;

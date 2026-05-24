export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Design tokens shared by web + miniapp. Values mirror the web Tailwind
 * config (apps/web/tailwind.config.ts) so the two surfaces stay visually
 * coherent. The miniapp consumes these via scripts/generate-tokens-wxss.mjs
 * → styles/tokens.wxss; the web consumes them via Tailwind utilities.
 */
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
  /** Kraft brown family — matches Tailwind kraft.{DEFAULT,dark,light}. */
  kraft: {
    base: '#A88A5C',
    dark: '#8B6E44',
    light: '#C9B288',
  },
  /** Pin / sticker accents — matches Tailwind pin.{red,blue,yellow,green}. */
  pin: {
    red: '#D23B3B',
    blue: '#3B6ED2',
    yellow: '#D2B03B',
    green: '#3BD271',
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
    kraft: {
      base: '#C9B288',
      dark: '#A88A5C',
      light: '#E1CDA3',
    },
    pin: {
      red: '#E07A60',
      blue: '#7A9BE0',
      yellow: '#E0C36A',
      green: '#7AD29E',
    },
  },
} as const;

export type Tokens = typeof tokens;

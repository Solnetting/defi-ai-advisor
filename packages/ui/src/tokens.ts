export const colors = {
  black: "#000000",
  white: "#FFFFFF",
  gray: {
    900: "#0a0a0a",
    800: "#1a1a1a",
    700: "#2a2a2a",
    600: "#3a3a3a",
    500: "#6b6b6b",
    400: "#9b9b9b",
  },
  purple: {
    400: "#c084fc",
    700: "#7e22ce",
  },
  green: {
    400: "#4ade80",
  },
  yellow: {
    300: "#fde047",
  },
  red: {
    400: "#f87171",
  },
} as const;

export const typography = {
  fontFamily: {
    sans: "Space Mono, monospace",
    mono: "Space Mono, monospace",
  },
  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
    "5xl": "3rem",
  },
} as const;

export const spacing = {
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
} as const;

// PrintMailBids Theme - Matching Web App
// Industrial color palette with clean, modern aesthetic

// Light mode colors
export const lightColors = {
  // Primary: Deep navy/slate
  primary: '#0f172a',
  primaryLight: '#1e293b',

  // Accent: Blue
  accent: '#2563eb',
  accentLight: '#3b82f6',
  accentMuted: '#93c5fd',
  accentFaint: '#eff6ff',

  // Secondary: Steel blue
  steel: '#475569',
  steelLight: '#64748b',

  // Neutral earth tones
  background: '#fafafa',
  sand: '#f5f5f4',
  stone: '#e7e5e4',
  warmGray: '#78716c',

  // Text
  foreground: '#0f172a',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  textLight: '#94a3b8',

  // States
  success: '#059669',
  successLight: '#d1fae5',
  warning: '#d97706',
  warningLight: '#fef3c7',
  error: '#dc2626',
  errorLight: '#fee2e2',

  // Borders
  border: '#e2e8f0',
  borderLight: '#f1f5f9',

  // Common
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',

  // Surfaces
  surface: '#ffffff',

  // Input fields
  inputBackground: '#ffffff',
} as const;

// Dark mode colors - WCAG AA compliant contrast ratios
export const darkColors = {
  // Primary: Inverted for dark mode
  primary: '#ffffff',
  primaryLight: '#f1f5f9',

  // Accent: Brighter blue for dark backgrounds (4.5:1+ contrast)
  accent: '#60a5fa',
  accentLight: '#93c5fd',
  accentMuted: '#bfdbfe',
  accentFaint: '#1e3a5f',

  // Secondary: Steel blue (lighter for dark mode readability)
  steel: '#e2e8f0',
  steelLight: '#f1f5f9',

  // Neutral earth tones (dark variants)
  background: '#0f172a',
  sand: '#1e293b',
  stone: '#334155',
  warmGray: '#e2e8f0',

  // Text - High contrast for accessibility (7:1+ for primary, 4.5:1+ for secondary)
  foreground: '#ffffff',
  textPrimary: '#ffffff',
  textSecondary: '#e2e8f0',
  textMuted: '#cbd5e1',
  textLight: '#94a3b8',

  // States (adjusted for dark backgrounds - brighter for visibility)
  success: '#34d399',
  successLight: '#064e3b',
  warning: '#fbbf24',
  warningLight: '#78350f',
  error: '#f87171',
  errorLight: '#7f1d1d',

  // Borders (visible on dark backgrounds)
  border: '#475569',
  borderLight: '#334155',

  // Common
  white: '#1e293b',  // Card/surface color in dark mode
  black: '#000000',
  transparent: 'transparent',

  // Surfaces
  surface: '#1e293b',

  // Input fields
  inputBackground: '#334155',
} as const;

// Default export for backward compatibility
export const colors = lightColors;

// ThemeColors uses string for color values to allow both light and dark themes
export type ThemeColors = {
  [K in keyof typeof lightColors]: string;
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  full: 9999,
} as const;

// iOS Dynamic Type scale aligned sizes
export const fontSize = {
  xs: 12,    // caption2
  sm: 13,    // caption1
  base: 15,  // subheadline
  lg: 17,    // body (iOS default)
  xl: 20,    // title3
  '2xl': 22, // title2
  '3xl': 28, // title1
  '4xl': 34, // largeTitle
} as const;

// Apple HIG minimum touch target size
export const minTouchTarget = 44;

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

// Animation timing
export const animation = {
  fast: 150,
  normal: 250,
  slow: 400,
  spring: {
    damping: 15,
    stiffness: 150,
  },
} as const;

// Common component styles
export const components = {
  button: {
    primary: {
      backgroundColor: colors.primary,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.lg,
    },
    secondary: {
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.lg,
    },
    accent: {
      backgroundColor: colors.accent,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.lg,
    },
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    ...shadows.md,
  },
} as const;

export default {
  colors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  shadows,
  animation,
  components,
};

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
} as const;

// Dark mode colors
export const darkColors = {
  // Primary: Inverted for dark mode
  primary: '#f8fafc',
  primaryLight: '#e2e8f0',

  // Accent: Slightly brighter blue for dark backgrounds
  accent: '#3b82f6',
  accentLight: '#60a5fa',
  accentMuted: '#93c5fd',
  accentFaint: '#1e3a5f',

  // Secondary: Steel blue (lighter for dark mode)
  steel: '#94a3b8',
  steelLight: '#cbd5e1',

  // Neutral earth tones (dark variants)
  background: '#0f172a',
  sand: '#1e293b',
  stone: '#334155',
  warmGray: '#94a3b8',

  // Text (inverted for dark mode)
  foreground: '#f8fafc',
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textLight: '#64748b',

  // States (adjusted for dark backgrounds)
  success: '#10b981',
  successLight: '#064e3b',
  warning: '#f59e0b',
  warningLight: '#78350f',
  error: '#ef4444',
  errorLight: '#7f1d1d',

  // Borders (darker variants)
  border: '#334155',
  borderLight: '#1e293b',

  // Common
  white: '#1e293b',  // Card/surface color in dark mode
  black: '#000000',
  transparent: 'transparent',

  // Surfaces
  surface: '#1e293b',
} as const;

// Default export for backward compatibility
export const colors = lightColors;

export type ThemeColors = typeof lightColors;

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

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

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

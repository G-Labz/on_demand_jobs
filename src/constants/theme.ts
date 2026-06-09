/**
 * Design tokens for On Demand Jobs.
 *
 * Mobile-first, clean and confident. Two role accents keep the Requester
 * ("Post Job") and Worker ("Go Online") experiences visually distinct.
 */
import type { TextStyle } from 'react-native';

export const colors = {
  // Brand / default action
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primaryMuted: '#DBEAFE',

  // Role accents
  requester: '#2563EB', // Requester side — Post Job
  requesterMuted: '#DBEAFE',
  worker: '#16A34A', // Worker side — Go Online
  workerMuted: '#DCFCE7',

  // Surfaces
  background: '#FFFFFF',
  surface: '#F8FAFC',
  surfaceAlt: '#F1F5F9',
  border: '#E2E8F0',

  // Text
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  // Status
  success: '#16A34A',
  successMuted: '#DCFCE7',
  warning: '#D97706',
  warningMuted: '#FEF3C7',
  danger: '#DC2626',
  dangerMuted: '#FEE2E2',
  info: '#2563EB',
  infoMuted: '#DBEAFE',

  // States
  disabled: '#E2E8F0',
  disabledText: '#94A3B8',
  overlay: 'rgba(15, 23, 42, 0.5)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, fontWeight: '700', lineHeight: 38 },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  heading: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 22 },
  bodyStrong: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  label: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  caption: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
} satisfies Record<string, TextStyle>;

export const theme = { colors, spacing, radius, typography } as const;
export type AppTheme = typeof theme;

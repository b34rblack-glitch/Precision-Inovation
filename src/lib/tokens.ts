// Design tokens — the single source of truth for the app's visual language,
// shared verbatim with the desktop app.
//
// This file is deliberately PURE: no imports at all, so it can be vendored into
// a non-React-Native build (see __tests__/purity.test.ts). Anything that needs a
// React Native type — notably the composed `type` text styles — lives in
// `src/theme.ts`, which re-exports everything here.
//
// Dark, high-contrast, utilitarian. Amber accent (reticle-illumination orange)
// is reserved for primary actions and confirmed DOPE; everything else stays
// neutral so data reads first.

export const colors = {
  bg: '#121417',
  surface: '#1C1F24',
  surfaceRaised: '#24282F',
  border: '#32373F',
  text: '#F2F3F5',
  textSecondary: '#9BA3AE',
  textTertiary: '#8A93A0',
  accent: '#F5A623',
  accentPressed: '#D98F14',
  onAccent: '#1A1300',
  confirmed: '#F5A623',
  predicted: '#8A93A0',
  danger: '#E5544B',
  dangerFill: '#B3382F',
  onDanger: '#FFFFFF',
  success: '#4CAF7D',
  fieldBg: '#000000',
  fieldText: '#FFB300',
} as const;

// Field mode's secondary ambers. These were previously hardcoded in
// app/field-card/[rifleId].tsx; naming them here keeps the desktop's field
// window identical without a second set of magic hex values.
export const fieldColors = {
  /** Subtitle / legend text. */
  secondary: '#B38600',
  /** Wind drift — a secondary correction, deliberately dimmer than the hold. */
  drift: '#8F6D00',
  /** Row rule. */
  rule: '#332800',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
} as const;

// Minimum touch target for bench use with cold/gloved hands.
export const touchTarget = 48;

// Pointer-driven UI can be denser than a gloved fingertip, but field mode keeps
// the full 48 even on desktop — it is read at arm's length either way.
export const pointerTarget = 32;

/**
 * Type scale without colour. `src/theme.ts` composes these with `colors` into
 * React Native `TextStyle`s; the desktop composes them into CSS. Keeping the
 * numbers here means the two apps cannot drift.
 */
export const typeScale = {
  title: { fontSize: 28, fontWeight: '700' },
  heading: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 16 },
  secondary: { fontSize: 14 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8 },
  caption: { fontSize: 12 },
  statValue: { fontSize: 22, fontWeight: '700' },
} as const;

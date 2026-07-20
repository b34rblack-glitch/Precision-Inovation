// Single design language for the whole app: dark, high-contrast, utilitarian.
// Amber accent (reticle-illumination orange) reserved for primary actions and
// confirmed DOPE; everything else stays neutral so data reads first.

export const colors = {
  bg: '#121417',
  surface: '#1C1F24',
  surfaceRaised: '#24282F',
  border: '#32373F',
  text: '#F2F3F5',
  textSecondary: '#9BA3AE',
  textTertiary: '#6B7380',
  accent: '#F5A623',
  accentPressed: '#D98F14',
  onAccent: '#1A1300',
  confirmed: '#F5A623',
  predicted: '#8A93A0',
  danger: '#E5544B',
  success: '#4CAF7D',
  fieldBg: '#000000',
  fieldText: '#FFB300',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 20, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 16, color: colors.text },
  secondary: { fontSize: 14, color: colors.textSecondary },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  mono: { fontVariant: ['tabular-nums' as const] },
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
} as const;

// Minimum touch target for bench use with cold/gloved hands.
export const touchTarget = 48;

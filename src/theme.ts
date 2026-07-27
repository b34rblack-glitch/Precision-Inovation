// The app's design language. Raw tokens (colours, spacing, radii, the type
// scale) live in `@/lib/tokens` so they can be vendored into the desktop build
// without pulling React Native in; this module re-exports them and adds the
// composed React Native text styles, which need RN's own types.

import type { TextStyle } from 'react-native';
import { colors, typeScale } from '@/lib/tokens';

export {
  colors,
  fieldColors,
  spacing,
  radii,
  touchTarget,
  pointerTarget,
  typeScale,
} from '@/lib/tokens';

// Typed as a mutable FontVariant[] so tokens carrying it stay assignable to
// RN's TextStyle when spread (an `as const` tuple would be readonly).
const tabularNums: NonNullable<TextStyle['fontVariant']> = ['tabular-nums'];

export const type = {
  title: { ...typeScale.title, color: colors.text },
  heading: { ...typeScale.heading, color: colors.text },
  body: { ...typeScale.body, color: colors.text },
  secondary: { ...typeScale.secondary, color: colors.textSecondary },
  label: {
    ...typeScale.label,
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
  },
  mono: { fontVariant: tabularNums },
  caption: { ...typeScale.caption, color: colors.textSecondary },
  statValue: {
    ...typeScale.statValue,
    color: colors.text,
    fontVariant: tabularNums,
  },
} as const;

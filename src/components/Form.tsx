import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { forwardRef, ReactNode, useImperativeHandle, useRef, useState } from 'react';
import {
  KeyboardTypeOptions,
  LayoutAnimation,
  Platform,
  Pressable,
  ReturnKeyTypeOptions,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { parseDecimal } from '@/lib/parse';
import { colors, radii, spacing, touchTarget, type } from '@/theme';

// Form primitives shared by every entry screen. Design rules:
// - big touch targets (bench use, gloves)
// - decimal keypads for all numeric input
// - progressive disclosure: optional detail lives inside CollapsibleSection

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  suffix?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  error?: string;
  autoCorrect?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
};

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  {
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType,
    suffix,
    multiline,
    autoFocus,
    error,
    autoCorrect = false,
    autoCapitalize,
    returnKeyType,
    onSubmitEditing,
  },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inputRef.current as TextInput);
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      <View
        style={[
          styles.inputBox,
          multiline && styles.inputBoxMultiline,
          !!error && { borderColor: colors.danger },
        ]}
      >
        <TextInput
          ref={inputRef}
          style={[styles.input, multiline && styles.multiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          keyboardType={keyboardType}
          multiline={multiline}
          autoFocus={autoFocus}
          autoCorrect={autoCorrect}
          autoCapitalize={autoCapitalize ?? (multiline ? 'sentences' : 'none')}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel={label + (suffix ? ' ' + suffix : '')}
        />
        {suffix ? (
          <Pressable onPress={() => inputRef.current?.focus()} style={styles.suffixPress}>
            <Text style={styles.suffix}>{suffix}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
});

type NumericFieldProps = Omit<FieldProps, 'keyboardType' | 'multiline'> & {
  /** Value may be negative — needs a keyboard with a minus sign. */
  signed?: boolean;
  /** Whole numbers only. */
  integer?: boolean;
};

export const NumericField = forwardRef<TextInput, NumericFieldProps>(function NumericField(
  { signed, integer, ...props },
  ref,
) {
  const keyboardType: KeyboardTypeOptions = signed
    ? Platform.select({ ios: 'numbers-and-punctuation' as const, default: 'default' as const })
    : integer
      ? 'number-pad'
      : 'decimal-pad';
  return <Field {...props} ref={ref} keyboardType={keyboardType} />;
});

type SegmentedProps<T extends string> = {
  label?: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
};

export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.field}>
      {label ? <Text style={type.label}>{label}</Text> : null}
      <View style={styles.segmentRow} accessibilityRole="radiogroup">
        {options.map((opt) => (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === opt }}
            style={({ pressed }) => [
              styles.segment,
              value === opt && styles.segmentActive,
              pressed && value !== opt && { backgroundColor: colors.surfaceRaised },
            ]}
          >
            <Text style={[styles.segmentLabel, value === opt && styles.segmentLabelActive]}>
              {opt}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

type StepperProps = {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
  decimals?: number;
  suffix?: string;
  min?: number;
};

const REPEAT_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 120;

export function Stepper({ label, value, step, onChange, decimals = 1, suffix, min = 0 }: StepperProps) {
  const round = (v: number) => Number(v.toFixed(decimals));
  // Refs keep long-press repeats and a11y actions on the latest value.
  const valueRef = useRef(value);
  valueRef.current = value;
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Local draft while the value is being typed directly; null when idle.
  const [draft, setDraft] = useState<string | null>(null);

  const nudge = (dir: 1 | -1) => {
    Haptics.selectionAsync();
    onChange(round(Math.max(min, valueRef.current + dir * step)));
  };
  const startRepeat = (dir: 1 | -1) => {
    stopRepeat();
    repeatRef.current = setInterval(() => nudge(dir), REPEAT_INTERVAL_MS);
  };
  const stopRepeat = () => {
    if (repeatRef.current) {
      clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  };
  const commitDraft = () => {
    if (draft !== null) {
      const parsed = parseDecimal(draft);
      if (parsed !== null) onChange(round(Math.max(min, parsed)));
      setDraft(null);
    }
  };

  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      <View
        style={styles.stepperRow}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: `${value.toFixed(decimals)}${suffix ? ' ' + suffix : ''}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') nudge(1);
          if (e.nativeEvent.actionName === 'decrement') nudge(-1);
        }}
      >
        <Pressable
          style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
          onPress={() => nudge(-1)}
          onLongPress={() => startRepeat(-1)}
          delayLongPress={REPEAT_DELAY_MS}
          onPressOut={stopRepeat}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Ionicons name="remove" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.stepperCenter}>
          <TextInput
            style={styles.stepperValue}
            value={draft ?? value.toFixed(decimals)}
            onFocus={() => setDraft(value.toFixed(decimals))}
            onChangeText={setDraft}
            onBlur={commitDraft}
            keyboardType="decimal-pad"
            selectTextOnFocus
            accessibilityLabel={label}
          />
          {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
        </View>
        <Pressable
          style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
          onPress={() => nudge(1)}
          onLongPress={() => startRepeat(1)}
          delayLongPress={REPEAT_DELAY_MS}
          onPressOut={stopRepeat}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Ionicons name="add" size={26} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

type SectionProps = {
  title: string;
  children: ReactNode;
  initiallyOpen?: boolean;
};

export function CollapsibleSection({ title, children, initiallyOpen = false }: SectionProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };
  return (
    <View style={styles.section}>
      <Pressable
        style={({ pressed }) => [
          styles.sectionHeader,
          pressed && { backgroundColor: colors.surfaceRaised },
        ]}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={type.heading}>{title}</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function Half({ children }: { children: ReactNode }) {
  return <View style={styles.half}>{children}</View>;
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.lg },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget,
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  inputBoxMultiline: { alignItems: 'flex-start' },
  input: {
    flex: 1,
    minHeight: touchTarget - 2,
    color: colors.text,
    fontSize: 17,
    paddingVertical: spacing.sm,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  suffix: { color: colors.textSecondary, fontSize: 15, marginLeft: spacing.sm },
  suffixPress: { alignSelf: 'stretch', justifyContent: 'center' },
  errorText: { ...type.caption, color: colors.danger, marginTop: spacing.xs },
  segmentRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: colors.accent },
  segmentLabel: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  segmentLabelActive: { color: colors.onAccent },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepBtn: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnPressed: { backgroundColor: colors.surfaceRaised },
  stepperCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    textAlign: 'center',
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingVertical: spacing.sm,
    minWidth: 80,
  },
  section: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    minHeight: touchTarget,
  },
  sectionBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
});

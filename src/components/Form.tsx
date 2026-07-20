import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useState } from 'react';
import {
  KeyboardTypeOptions,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
};

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  suffix,
  multiline,
  autoFocus,
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, multiline && styles.multiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          keyboardType={keyboardType}
          multiline={multiline}
          autoFocus={autoFocus}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function NumericField(props: Omit<FieldProps, 'keyboardType' | 'multiline'>) {
  return <Field {...props} keyboardType="decimal-pad" />;
}

type SegmentedProps<T extends string> = {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
};

export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      <View style={styles.segmentRow}>
        {options.map((opt) => (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.segment, value === opt && styles.segmentActive]}
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

export function Stepper({ label, value, step, onChange, decimals = 1, suffix, min = 0 }: StepperProps) {
  const round = (v: number) => Number(v.toFixed(decimals));
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          style={styles.stepBtn}
          onPress={() => onChange(round(Math.max(min, value - step)))}
        >
          <Ionicons name="remove" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.stepperValue}>
          {value.toFixed(decimals)}
          {suffix ? <Text style={styles.suffix}> {suffix}</Text> : null}
        </Text>
        <Pressable style={styles.stepBtn} onPress={() => onChange(round(value + step))}>
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
  return (
    <View style={styles.section}>
      <Pressable style={styles.sectionHeader} onPress={() => setOpen((o) => !o)}>
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
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: touchTarget,
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    color: colors.text,
    fontSize: 17,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  suffix: { color: colors.textSecondary, fontSize: 15, marginLeft: spacing.sm },
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
    minHeight: touchTarget - 4,
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
  stepperValue: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  section: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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

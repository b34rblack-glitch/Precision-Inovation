import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { Segmented } from '@/components/Form';
import { Screen } from '@/components/Screen';
import { FORM_GROUPS, type FormGroup } from '@/features/loads/formGroups';
import { STAGE_TITLES } from '@/features/loads/recipe';
import { useFormPrefs } from '@/stores/formPrefsStore';
import { colors, spacing, type } from '@/theme';

// Which optional groups the load form shows. Same preference the form's own
// Simple / Full switch and "Not used" links edit, laid out in one place.

const STAGE_LABEL: Record<FormGroup['stage'], string> = {
  bulletDetail: 'Bullet ballistics detail',
  ...STAGE_TITLES,
};

export default function FormFieldsScreen() {
  const prefs = useFormPrefs();
  const notUsed = new Set(prefs.notUsed);
  const stages = [...new Set(FORM_GROUPS.map((g) => g.stage))];

  return (
    <Screen underHeader>
      <Text style={[type.secondary, { marginBottom: spacing.md, color: colors.textTertiary }]}>
        Simple shows the groups most loaders track; Full shows every group. Untick a group you never
        use and it leaves the load form in both modes. A group that already holds data on a load
        always shows there, so nothing recorded is hidden.
      </Text>
      <Segmented
        label="Load form"
        options={['Simple', 'Full'] as const}
        value={prefs.mode === 'simple' ? 'Simple' : 'Full'}
        onChange={(v) => prefs.setMode(v === 'Simple' ? 'simple' : 'full')}
      />
      {stages.map((stage) => (
        <Card key={stage}>
          <Text style={[type.label, { marginBottom: spacing.xs }]}>{STAGE_LABEL[stage]}</Text>
          {FORM_GROUPS.filter((g) => g.stage === stage).map((g) => {
            const shown = !notUsed.has(g.key);
            const inSimple = g.core;
            return (
              <Pressable
                key={g.key}
                onPress={() => prefs.setNotUsed(g.key, shown)}
                style={styles.row}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: shown }}
                accessibilityLabel={g.title}
              >
                <Ionicons name={shown ? 'checkbox' : 'square-outline'} size={22} color={shown ? colors.accent : colors.textTertiary} />
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>{g.title}</Text>
                  <Text style={type.caption}>{inSimple ? 'in Simple and Full' : 'Full only'}</Text>
                </View>
              </Pressable>
            );
          })}
        </Card>
      ))}
      <Button label="Show Everything Again" variant="secondary" onPress={prefs.reset} style={{ marginBottom: spacing.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
});

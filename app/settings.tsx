import { Text } from 'react-native';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { spacing, type } from '@/theme';

export default function SettingsScreen() {
  return (
    <Screen>
      <Card>
        <Text style={type.heading}>Precision Innovation</Text>
        <Text style={[type.secondary, { marginTop: spacing.sm }]}>
          All data lives on this device. Backup & export arrive in a later build.
        </Text>
      </Card>
    </Screen>
  );
}

import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { exportBackup, restoreBackup } from '@/lib/backup';
import { spacing, type } from '@/theme';

export default function SettingsScreen() {
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      await exportBackup();
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    Alert.alert(
      'Replace all data?',
      'Importing a backup replaces everything currently in the app. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const json = await new File(uri).text();
              const { counts } = await restoreBackup(json);
              Alert.alert(
                'Backup restored',
                `Imported ${counts.rifles ?? 0} rifles, ${counts.loads ?? 0} loads, ${
                  counts.rangeSessions ?? 0
                } sessions.`,
              );
            } catch (e) {
              Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Card>
        <Text style={type.heading}>Your data</Text>
        <Text style={[type.secondary, { marginTop: spacing.sm, marginBottom: spacing.lg }]}>
          Everything lives on this device — nothing is uploaded anywhere. Export a backup before
          switching phones, and back up regularly.
        </Text>
        <Button label={busy ? 'Working…' : 'Export Backup'} onPress={doExport} disabled={busy} />
        <Button
          label="Import Backup"
          variant="secondary"
          onPress={doImport}
          disabled={busy}
          style={{ marginTop: spacing.md }}
        />
      </Card>

      <Card>
        <Text style={type.heading}>About</Text>
        <Text style={[type.secondary, { marginTop: spacing.sm }]}>
          Precision Innovation tracks rifles, load development, and real DOPE. Range-card
          predictions come from a point-mass ballistic solver and are replaced by your confirmed
          holds as you shoot. Always start load workups from published data and watch for pressure
          signs — this app records your results; it does not validate load safety.
        </Text>
      </Card>
    </Screen>
  );
}

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { buildBackup, exportBackup, restoreBackup } from '@/lib/backup';
import { spacing, type } from '@/theme';

export default function SettingsScreen() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const doExport = async () => {
    setExporting(true);
    try {
      await exportBackup();
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  // Written to cache right before a restore wipes the database, so a bad
  // import file can't silently destroy the only copy of the user's data.
  const writeSafetyBackup = async (): Promise<void> => {
    const backup = await buildBackup();
    const file = new File(Paths.cache, 'precision-pre-restore-backup.json');
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(backup));
  };

  const doImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const uri = result.assets[0].uri;
      Alert.alert(
        'Replace all data?',
        'Importing a backup replaces everything currently in the app. A safety copy of current data is saved first.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: async () => {
              setImporting(true);
              try {
                await writeSafetyBackup();
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
                setImporting(false);
              }
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen underHeader>
      <Card>
        <Text style={type.heading}>Your data</Text>
        <Text style={[type.secondary, { marginTop: spacing.sm, marginBottom: spacing.lg }]}>
          Everything lives on this device — nothing is uploaded anywhere. Export a backup before
          switching phones, and back up regularly.
        </Text>
        <Button label="Export Backup" onPress={doExport} loading={exporting} disabled={importing} />
        <Button
          label="Import Backup"
          variant="secondary"
          onPress={doImport}
          loading={importing}
          disabled={exporting}
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

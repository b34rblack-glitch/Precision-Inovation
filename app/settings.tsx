import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useState } from 'react';
import { Alert, Share, Text } from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AddFromBackupModal } from '@/features/backup/AddFromBackupModal';
import { SyncCard } from '@/features/sync/SyncCard';
import { addFromBackup } from '@/db/repositories/importBackup';
import { buildBackup, exportBackup, restoreBackup } from '@/lib/backup';
import { clearCrashReport, formatCrashReport, readCrashReport, type CrashReport } from '@/lib/crashLog';
import { describeBackup, parseBackup, type BackupSummary, type ImportSelection } from '@/lib/share';
import { colors, spacing, type } from '@/theme';

/** Open a JSON file from the device and return its text, or null if cancelled. */
async function pickJsonFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]) return null;
  return new File(result.assets[0].uri).text();
}

export default function SettingsScreen() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  // "Add from backup": the parsed file waits here while the picker is open.
  const [pending, setPending] = useState<{ json: string; summary: BackupSummary } | null>(null);
  const [adding, setAdding] = useState(false);
  const busy = exporting || importing || adding;
  const [crash, setCrash] = useState<CrashReport | null>(() => readCrashReport());

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

  // Merge: add selected rifles from a backup or a friend's shared rifle file
  // next to the data already here. Nothing existing is touched.
  const doAdd = async () => {
    try {
      const json = await pickJsonFile();
      if (json == null) return;
      const parsed = parseBackup(json);
      const summary = describeBackup(parsed.tables, parsed.share);
      if (summary.rifles.length === 0 && summary.unattachedLoads === 0) {
        Alert.alert('Nothing to add', 'This file has no rifles or loads in it.');
        return;
      }
      setPending({ json, summary });
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    }
  };

  const confirmAdd = async (selection: ImportSelection) => {
    if (!pending) return;
    setAdding(true);
    try {
      const { counts } = await addFromBackup(pending.json, selection);
      setPending(null);
      Alert.alert(
        'Added to your data',
        `Added ${counts.rifles} ${counts.rifles === 1 ? 'rifle' : 'rifles'}, ${counts.loads} ${
          counts.loads === 1 ? 'load' : 'loads'
        }, ${counts.rangeSessions} ${counts.rangeSessions === 1 ? 'session' : 'sessions'}.`,
      );
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  const doImport = async () => {
    try {
      const json = await pickJsonFile();
      if (json == null) return;
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
      {crash ? (
        <Card>
          <Text style={type.heading}>Last crash</Text>
          <Text style={[type.secondary, { marginTop: spacing.sm }]}>
            The app closed unexpectedly on {new Date(crash.at).toLocaleString()}. Share this report
            with whoever is fixing it; the last actions before the crash are included.
          </Text>
          <Text
            style={[type.caption, { fontFamily: 'monospace', color: colors.text, marginVertical: spacing.md }]}
            selectable
            numberOfLines={12}
          >
            {formatCrashReport(crash)}
          </Text>
          <Button
            label="Share Report"
            onPress={() => void Share.share({ message: formatCrashReport(crash) })}
          />
          <Button
            label="Dismiss"
            variant="secondary"
            onPress={() => {
              clearCrashReport();
              setCrash(null);
            }}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      ) : null}

      <SyncCard />

      <Card>
        <Text style={type.heading}>Your data</Text>
        <Text style={[type.secondary, { marginTop: spacing.sm, marginBottom: spacing.lg }]}>
          Your data lives on this device. Nothing is uploaded unless you turn on cloud sync above,
          and even then it goes only to a folder in your own Google Drive. Export a backup before
          switching phones, and back up regularly.
        </Text>
        <Button label="Export Backup" onPress={doExport} loading={exporting} disabled={busy && !exporting} />
        <Text style={[type.secondary, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>
          Add from Backup keeps everything you have and adds the rifles you pick from a backup or a
          rifle a friend shared with you. Restore Backup replaces everything.
        </Text>
        <Button
          label="Add from Backup"
          variant="secondary"
          onPress={doAdd}
          loading={adding}
          disabled={busy && !adding}
        />
        <Button
          label="Restore Backup (replace all)"
          variant="secondary"
          onPress={doImport}
          loading={importing}
          disabled={busy && !importing}
          style={{ marginTop: spacing.md }}
        />
      </Card>

      <AddFromBackupModal
        visible={pending !== null}
        summary={pending?.summary ?? null}
        busy={adding}
        onClose={() => setPending(null)}
        onConfirm={confirmAdd}
      />

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

import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { loadByIdQuery, updateLoad, versionsForLoadQuery } from '@/db/repositories/loads';
import { crumb } from '@/lib/crashLog';
import { LoadForm } from '@/features/loads/LoadForm';

export default function EditLoadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: loadRows, updatedAt } = useLiveQuery(loadByIdQuery(id), [id]);
  const { data: versions } = useLiveQuery(versionsForLoadQuery(id), [id]);
  const load = loadRows[0];
  if (!load) {
    if (updatedAt === undefined) return <Screen underHeader>{null}</Screen>;
    return (
      <Screen underHeader>
        <EmptyState
          icon="alert-circle-outline"
          title="Load not found"
          message="This load may have been archived or deleted."
          action={{ label: 'Back to Loads', onPress: () => router.replace('/loads') }}
        />
      </Screen>
    );
  }
  const currentVersion = versions.find((v) => v.id === load.currentVersionId) ?? versions[0];

  return (
    <LoadForm
      initialLoad={load}
      initialVersion={currentVersion}
      submitLabel="Save Changes"
      onSubmit={async ({ meta, components }) => {
        // A thrown error is shown by the form as "Save failed".
        const { createdNewVersion } = await updateLoad(load.id, meta, components);
        crumb(`edit load: updateLoad done, newVersion=${createdNewVersion}`);
        if (!createdNewVersion) return () => router.back();
        // Leave only once the alert is gone. Raising a native dialog in the
        // same tick as a native-stack pop overlaps two fragment transactions
        // on the one Android activity; sequencing them also reads better.
        return () => {
          let left = false;
          const leave = () => {
            if (left) return;
            left = true;
            crumb('edit load: alert dismissed, going back');
            router.back();
          };
          crumb('edit load: showing new-version alert');
          Alert.alert(
            'New version created',
            'This load had range history, so your changes were saved as a new version. Past results stay tied to the recipe that produced them.',
            [{ text: 'OK', onPress: leave }],
            { cancelable: true, onDismiss: leave },
          );
        };
      }}
    />
  );
}

import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { loadByIdQuery, updateLoad, versionsForLoadQuery } from '@/db/repositories/loads';
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
        if (!createdNewVersion) {
          router.back();
          return;
        }
        // Leave only once the alert is gone. This screen used to raise the
        // dialog and pop itself in the same tick; a native dialog and a
        // native-stack pop are both fragment transactions on the one Android
        // activity, and that overlap is the likeliest cause of the app closing
        // on save. Sequencing them also reads better: acknowledge, then leave.
        let left = false;
        const leave = () => {
          if (left) return;
          left = true;
          router.back();
        };
        Alert.alert(
          'New version created',
          'This load had range history, so your changes were saved as a new version. Past results stay tied to the recipe that produced them.',
          [{ text: 'OK', onPress: leave }],
          { cancelable: true, onDismiss: leave },
        );
      }}
    />
  );
}

import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { Screen } from '@/components/Screen';
import { loadByIdQuery, updateLoad, versionsForLoadQuery } from '@/db/repositories/loads';
import { LoadForm } from '@/features/loads/LoadForm';

export default function EditLoadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: loadRows } = useLiveQuery(loadByIdQuery(id), [id]);
  const { data: versions } = useLiveQuery(versionsForLoadQuery(id), [id]);
  const load = loadRows[0];
  if (!load) return <Screen>{null}</Screen>;
  const currentVersion = versions.find((v) => v.id === load.currentVersionId) ?? versions[0];

  return (
    <Screen>
      <LoadForm
        initialLoad={load}
        initialVersion={currentVersion}
        submitLabel="Save Changes"
        onSubmit={async ({ meta, components }) => {
          const { createdNewVersion } = await updateLoad(load.id, meta, components);
          if (createdNewVersion) {
            Alert.alert(
              'New version created',
              'This load had range history, so your changes were saved as a new version. Past results stay tied to the recipe that produced them.',
            );
          }
          router.back();
        }}
      />
    </Screen>
  );
}

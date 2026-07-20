import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { Screen } from '@/components/Screen';
import { rifleByIdQuery, updateRifle } from '@/db/repositories/rifles';
import { RifleForm } from '@/features/rifles/RifleForm';

export default function EditRifleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data } = useLiveQuery(rifleByIdQuery(id), [id]);
  const rifle = data[0];
  if (!rifle) return <Screen underHeader>{null}</Screen>;

  return (
    <Screen underHeader>
      <RifleForm
        initial={rifle}
        submitLabel="Save Changes"
        onSubmit={async (values) => {
          try {
            await updateRifle(rifle.id, values);
            router.back();
          } catch (e) {
            Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </Screen>
  );
}

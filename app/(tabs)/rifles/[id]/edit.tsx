import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { rifleByIdQuery, updateRifle } from '@/db/repositories/rifles';
import { RifleForm } from '@/features/rifles/RifleForm';

export default function EditRifleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data } = useLiveQuery(rifleByIdQuery(id), [id]);
  const rifle = data[0];
  if (!rifle) return <Screen>{null}</Screen>;

  return (
    <Screen>
      <RifleForm
        initial={rifle}
        submitLabel="Save Changes"
        onSubmit={async (values) => {
          await updateRifle(rifle.id, values);
          router.back();
        }}
      />
    </Screen>
  );
}

import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { createRifle } from '@/db/repositories/rifles';
import { RifleForm } from '@/features/rifles/RifleForm';

export default function NewRifleScreen() {
  const router = useRouter();
  return (
    <Screen>
      <RifleForm
        submitLabel="Save Rifle"
        onSubmit={async (values) => {
          const rifle = await createRifle(values);
          router.replace(`/rifles/${rifle.id}`);
        }}
      />
    </Screen>
  );
}

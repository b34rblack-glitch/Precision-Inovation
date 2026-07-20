import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { createLoad } from '@/db/repositories/loads';
import { LoadForm } from '@/features/loads/LoadForm';

export default function NewLoadScreen() {
  const router = useRouter();
  return (
    <Screen>
      <LoadForm
        submitLabel="Save Load"
        onSubmit={async ({ meta, components }) => {
          const load = await createLoad(meta, components);
          router.replace(`/loads/${load.id}`);
        }}
      />
    </Screen>
  );
}

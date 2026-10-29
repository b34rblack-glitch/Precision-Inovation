import { useLocalSearchParams, useRouter } from 'expo-router';
import { createLoad } from '@/db/repositories/loads';
import { LoadForm } from '@/features/loads/LoadForm';

export default function NewLoadScreen() {
  const router = useRouter();
  // Deep links like "New load for this rifle" preselect the rifle.
  const { rifleId } = useLocalSearchParams<{ rifleId?: string }>();
  return (
    <LoadForm
      submitLabel="Save Load"
      defaultRifleId={rifleId ?? null}
      onSubmit={async ({ meta, components }) => {
        // A thrown error is shown by the form as "Save failed".
        const load = await createLoad(meta, components);
        router.replace(`/loads/${load.id}`);
      }}
    />
  );
}

import { useRouter } from 'expo-router';
import { createRifle } from '@/db/repositories/rifles';
import { RifleForm } from '@/features/rifles/RifleForm';

export default function NewRifleScreen() {
  const router = useRouter();
  return (
    <RifleForm
      submitLabel="Save Rifle"
      onSubmit={async (values) => {
        // A thrown error is shown by the form as "Save failed".
        const rifle = await createRifle(values);
        return () => router.replace(`/rifles/${rifle.id}`);
      }}
    />
  );
}

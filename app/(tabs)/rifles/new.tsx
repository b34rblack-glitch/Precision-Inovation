import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { Screen } from '@/components/Screen';
import { createRifle } from '@/db/repositories/rifles';
import { RifleForm } from '@/features/rifles/RifleForm';

export default function NewRifleScreen() {
  const router = useRouter();
  return (
    <Screen underHeader>
      <RifleForm
        submitLabel="Save Rifle"
        onSubmit={async (values) => {
          try {
            const rifle = await createRifle(values);
            router.replace(`/rifles/${rifle.id}`);
          } catch (e) {
            Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </Screen>
  );
}

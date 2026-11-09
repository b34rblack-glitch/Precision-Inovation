import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { Button } from '@/components/Buttons';
import { Screen } from '@/components/Screen';
import { createLoad } from '@/db/repositories/loads';
import { LoadForm } from '@/features/loads/LoadForm';

export default function NewLoadScreen() {
  const router = useRouter();
  // Deep links like "New load for this rifle" preselect the rifle.
  const { rifleId } = useLocalSearchParams<{ rifleId?: string }>();
  return (
    <Screen underHeader>
      <Button
        label="Switch to Guided Setup"
        variant="secondary"
        onPress={() =>
          router.replace(rifleId ? `/loads/wizard?rifleId=${rifleId}` : '/loads/wizard')
        }
      />
      <LoadForm
        submitLabel="Save Load"
        defaultRifleId={rifleId ?? null}
        onSubmit={async ({ meta, components }) => {
          try {
            const load = await createLoad(meta, components);
            router.replace(`/loads/${load.id}`);
          } catch (e) {
            Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </Screen>
  );
}

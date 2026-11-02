import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { Screen } from '@/components/Screen';
import { createRifle } from '@/db/repositories/rifles';
import { RifleForm } from '@/features/rifles/RifleForm';

export default function NewRifleScreen() {
  const router = useRouter();
  // The Build-a-Load walkthrough sends people here when they have no rifle
  // yet; `returnTo` takes them straight back with the new rifle selected.
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  return (
    <Screen underHeader>
      <RifleForm
        submitLabel="Save Rifle"
        onSubmit={async (values) => {
          try {
            const rifle = await createRifle(values);
            if (returnTo && returnTo.startsWith('/')) {
              // Pop this form, then re-focus the caller (still mounted in its own
              // tab) with the rifle it asked for.
              router.back();
              router.navigate({ pathname: returnTo as never, params: { rifleId: rifle.id } } as never);
            } else {
              router.replace(`/rifles/${rifle.id}`);
            }
          } catch (e) {
            Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </Screen>
  );
}

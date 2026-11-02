import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { createLoad } from '@/db/repositories/loads';
import { GuidedLoadWizard } from '@/features/loads/GuidedLoadWizard';

export default function GuidedLoadScreen() {
  const router = useRouter();
  // "Build a Load for this Rifle" preselects the rifle and seeds its cartridge.
  const { rifleId } = useLocalSearchParams<{ rifleId?: string }>();
  return (
    <GuidedLoadWizard
      defaultRifleId={rifleId ?? null}
      onSubmit={async ({ meta, components }, { startWorkup }) => {
        try {
          const load = await createLoad(meta, components);
          // The load detail replaces the walkthrough so Back never lands on a
          // half-finished wizard; the workup planner stacks on top of it.
          router.replace(`/loads/${load.id}`);
          if (startWorkup) router.push(`/loads/${load.id}/workups/new`);
        } catch (e) {
          Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
        }
      }}
    />
  );
}

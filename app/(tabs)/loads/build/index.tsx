import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { addBatch } from '@/db/repositories/batches';
import { createLoad } from '@/db/repositories/loads';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import { createWorkup } from '@/db/repositories/workups';
import { BuildLoadWizard } from '@/features/loads/BuildLoadWizard';
import { roundsLoadedOf } from '@/features/loads/buildLoad';
import { parseDecimal } from '@/lib/parse';
import { distanceToYd } from '@/lib/units';
import { DEFAULT_SHOTS_PER_CHARGE } from '@/lib/workup/seriesGenerator';
import { useBuildLoad } from '@/stores/buildLoadStore';

export default function BuildLoadScreen() {
  const router = useRouter();
  // "Build a Load for this Rifle" preselects the rifle; New Rifle's returnTo
  // sends the just-created rifle's id back the same way.
  const { rifleId } = useLocalSearchParams<{ rifleId?: string }>();
  const { draft, start, patch, reset } = useBuildLoad();
  const { data: rifles } = useLiveQuery(activeRiflesQuery());

  useEffect(() => {
    if (!draft) start({ rifleId: rifleId ?? null });
    else if (rifleId && draft.rifleId !== rifleId) patch({ rifleId });
    // Only a changed rifleId param should re-run this; the draft itself changes constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rifleId]);

  return (
    <BuildLoadWizard
      onSubmit={async ({ meta, components }, d) => {
        try {
          if (d.stringType === 'ladder' && (!meta.rifleId || components.chargeGr == null)) {
            Alert.alert(
              'Starting charge needed',
              'A charge ladder needs a rifle and a starting charge. Add the charge, or go back and pick Batch.',
            );
            return;
          }
          const load = await createLoad(meta, components);
          let workupId: string | null = null;
          let batchRounds: number | null = null;
          if (d.stringType === 'ladder' && meta.rifleId && components.chargeGr != null) {
            const rifle = rifles.find((r) => r.id === meta.rifleId);
            const distance = parseDecimal(d.testDistance);
            const workup = await createWorkup({
              rifleId: meta.rifleId,
              loadId: load.id,
              baseVersionId: load.currentVersionId,
              type: d.ladderMethod,
              // The saved recipe's charge is the first rung, whatever was typed earlier.
              startChargeGr: components.chargeGr,
              incrementGr: d.incrementGr,
              stepCount: d.stepCount,
              shotsPerCharge: DEFAULT_SHOTS_PER_CHARGE[d.ladderMethod],
              distanceYd:
                distance != null
                  ? distanceToYd(distance, rifle?.distanceUnit ?? 'yd')
                  : d.ladderMethod === 'ladder'
                    ? 300
                    : 100,
              notes: null,
            });
            workupId = workup.id;
          }
          // A batch run opens its batch-log row straight away, with the lots the
          // walkthrough already collected. Runout and the fired mark get filled
          // in later from the load screen.
          if (d.stringType === 'batch') {
            const quantity = roundsLoadedOf(d);
            if (quantity != null && load.currentVersionId) {
              await addBatch({
                loadVersionId: load.currentVersionId,
                date: new Date(),
                quantity,
                brassLot: components.caseLotNumber ?? null,
                powderLot: components.powderLotNumber ?? null,
                primerLot: components.primerLotNumber ?? null,
                bulletLot: components.bulletLotNumber ?? null,
                runoutReadingsIn: null,
                runoutThresholdIn: null,
                firedAt: null,
                notes: null,
              });
              batchRounds = quantity;
            }
          }
          reset();
          // The hand-off replaces the walkthrough so Back never lands on a finished wizard.
          router.replace(
            `/loads/build/done?loadId=${load.id}${workupId ? `&workupId=${workupId}` : ''}${
              batchRounds != null ? `&rounds=${batchRounds}` : ''
            }`,
          );
        } catch (e) {
          Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
        }
      }}
    />
  );
}

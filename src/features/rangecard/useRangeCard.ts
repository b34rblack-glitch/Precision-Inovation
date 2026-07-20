import { useCallback, useEffect, useState } from 'react';
import { getOrCreateCard, setCardMvOverride, setCardPreset } from '@/db/repositories/rangeCards';
import { getVersionById } from '@/db/repositories/loads';
import {
  confirmedDopeForRifleLoad,
  latestMeasuredMv,
  latestSessionAtmo,
} from '@/db/repositories/sessions';
import { BallisticInput } from '@/lib/ballistics/types';
import { buildCardRows, CardRow, ObservedDope, trueMuzzleVelocity } from '@/lib/rangecard/merge';
import { CardPreset, presetConfig } from '@/lib/rangecard/presets';
import { LoadVersion, RangeCard, Rifle } from '@/db/schema';

// ICAO sea-level standard — the fallback atmosphere when a load has no logged
// session conditions yet.
const ICAO_ATMO = { tempF: 59, pressureInHg: 29.9213 } as const;

type SessionAtmo = {
  tempF: number | null;
  pressureInHg: number | null;
  altitudeFt: number | null;
  humidityPct: number | null;
};

/**
 * Solver atmosphere resolved from the latest logged session, with unset fields
 * filled from ICAO sea-level. Altitude is preserved as a pressure source when
 * no station pressure was recorded (computeAtmosphere prefers pressureInHg,
 * then altitudeFt, then ICAO), so the default pressure is only substituted when
 * the session gave neither.
 */
function resolveAtmo(sessionAtmo: SessionAtmo | null): BallisticInput['atmo'] {
  if (!sessionAtmo) return { ...ICAO_ATMO };
  const hasPressureSource =
    sessionAtmo.pressureInHg != null || sessionAtmo.altitudeFt != null;
  return {
    tempF: sessionAtmo.tempF ?? ICAO_ATMO.tempF,
    pressureInHg:
      sessionAtmo.pressureInHg ?? (hasPressureSource ? null : ICAO_ATMO.pressureInHg),
    altitudeFt: sessionAtmo.altitudeFt,
    humidityPct: sessionAtmo.humidityPct,
  };
}

export type RangeCardState = {
  status: 'loading' | 'missing-data' | 'ready' | 'error';
  /** Human-readable failure reason when status is 'error'. */
  errorMessage: string | null;
  /** What's missing when status is 'missing-data'. */
  missing: string[];
  card: RangeCard | null;
  version: LoadVersion | null;
  rows: CardRow[];
  mvSource: 'override' | 'load' | 'measured' | null;
  mvFps: number | null;
  confirmedCount: number;
  refresh: () => void;
  changePreset: (p: CardPreset) => Promise<void>;
  trueUp: () => Promise<number | null>;
  clearTrueUp: () => Promise<void>;
};

export function useRangeCard(rifle: Rifle | undefined, loadVersionId: string | null): RangeCardState {
  const [state, setState] = useState<Omit<RangeCardState, 'refresh' | 'changePreset' | 'trueUp' | 'clearTrueUp'>>({
    status: 'loading',
    errorMessage: null,
    missing: [],
    card: null,
    version: null,
    rows: [],
    mvSource: null,
    mvFps: null,
    confirmedCount: 0,
  });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    // Reset to a clean loading state whenever inputs change so a stale card
    // from the previous load can't receive preset/true-up writes during the
    // refetch window.
    setState((s) => ({
      ...s,
      status: 'loading',
      errorMessage: null,
      card: null,
      rows: [],
      confirmedCount: 0,
    }));
    (async () => {
      if (!rifle) {
        // Rifle still resolving upstream — stay in the loading state.
        return;
      }
      if (!loadVersionId) {
        // Terminal: a field card was opened without a load selected. Without
        // this the hook would spin in 'loading' forever.
        setState({
          status: 'missing-data',
          errorMessage: null,
          missing: ['a selected load'],
          card: null,
          version: null,
          rows: [],
          mvSource: null,
          mvFps: null,
          confirmedCount: 0,
        });
        return;
      }
      const [card, version, observedRaw, sessionAtmo] = await Promise.all([
        getOrCreateCard(rifle.id, loadVersionId, rifle.distanceUnit),
        getVersionById(loadVersionId),
        confirmedDopeForRifleLoad(rifle.id, loadVersionId),
        latestSessionAtmo(loadVersionId),
      ]);
      if (cancelled) return;

      const missing: string[] = [];
      if (!version?.bcValue || !version?.bcModel) missing.push('bullet BC (edit the load)');

      let mvFps: number | null = null;
      let mvSource: 'override' | 'load' | 'measured' | null = null;
      if (card.mvOverrideFps != null) {
        mvFps = card.mvOverrideFps;
        mvSource = 'override';
      } else if (version?.muzzleVelocityFps != null) {
        mvFps = version.muzzleVelocityFps;
        mvSource = 'load';
      } else {
        const measured = await latestMeasuredMv(loadVersionId);
        if (measured != null) {
          mvFps = measured;
          mvSource = 'measured';
        }
      }
      if (cancelled) return;
      if (mvFps == null) missing.push('muzzle velocity (log a chrono string or set it on the load)');

      if (missing.length > 0 || !version) {
        setState({
          status: 'missing-data',
          errorMessage: null,
          missing,
          card,
          version: version ?? null,
          rows: [],
          mvSource,
          mvFps,
          confirmedCount: 0,
        });
        return;
      }

      const zeroDistanceYd =
        rifle.distanceUnit === 'm' ? rifle.zeroDistance / 0.9144 : rifle.zeroDistance;
      if (!(zeroDistanceYd > 0)) {
        // A non-positive zero diverges the solver's zero-angle search — surface
        // it rather than feeding garbage in.
        setState({
          status: 'error',
          errorMessage:
            'This rifle has an invalid zero distance. Set a zero greater than 0 to build a range card.',
          missing: [],
          card,
          version,
          rows: [],
          mvSource,
          mvFps,
          confirmedCount: 0,
        });
        return;
      }

      // Resolve atmosphere at build time from the latest logged session for
      // this load (do not persist a stale snapshot); ICAO if none exists.
      const atmo = resolveAtmo(sessionAtmo);
      const observations: ObservedDope[] = observedRaw.map((o) => ({
        distanceYd: o.distanceYd,
        elevationHold: o.elevationHold,
        windageHold: o.windageHold,
        holdUnit: o.holdUnit,
        recordedAt: o.sessionDate,
        createdAt: o.createdAt,
      }));

      const rows = buildCardRows({
        solverInput: {
          mvFps: mvFps!,
          bc: version.bcValue!,
          bcModel: version.bcModel!,
          zeroDistanceYd,
          sightHeightIn: rifle.sightHeightIn,
          atmo,
          maxDistanceYd: card.endDistanceYd,
          stepYd: card.incrementYd,
          bulletWeightGr: version.bulletWeightGr,
        },
        observations,
        turretUnit: rifle.turretUnit,
      }).filter((r) => r.distanceYd >= card.startDistanceYd - 1e-6);

      setState({
        status: 'ready',
        errorMessage: null,
        missing: [],
        card,
        version,
        rows,
        mvSource,
        mvFps,
        confirmedCount: rows.filter((r) => r.confirmed).length,
      });
    })().catch((e: unknown) => {
      // Without this the hook would stay in 'loading' forever on any db error.
      if (cancelled) return;
      setState((s) => ({
        ...s,
        status: 'error',
        errorMessage: e instanceof Error ? e.message : String(e),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [rifle, loadVersionId, tick]);

  const changePreset = useCallback(
    async (p: CardPreset) => {
      if (!state.card || !rifle) return;
      await setCardPreset(state.card.id, p, rifle.distanceUnit);
      refresh();
    },
    [state.card, rifle, refresh],
  );

  const trueUp = useCallback(async (): Promise<number | null> => {
    if (!state.card || !state.version || !rifle || state.mvFps == null || !loadVersionId)
      return null;
    const [observedRaw, sessionAtmo] = await Promise.all([
      confirmedDopeForRifleLoad(rifle.id, loadVersionId),
      latestSessionAtmo(loadVersionId),
    ]);
    const observations: ObservedDope[] = observedRaw.map((o) => ({
      distanceYd: o.distanceYd,
      elevationHold: o.elevationHold,
      windageHold: o.windageHold,
      holdUnit: o.holdUnit,
      recordedAt: o.sessionDate,
      createdAt: o.createdAt,
    }));
    const atmo = resolveAtmo(sessionAtmo);
    const trued = trueMuzzleVelocity({
      solverInput: {
        mvFps: state.mvFps,
        bc: state.version.bcValue!,
        bcModel: state.version.bcModel!,
        zeroDistanceYd:
          rifle.distanceUnit === 'm' ? rifle.zeroDistance / 0.9144 : rifle.zeroDistance,
        sightHeightIn: rifle.sightHeightIn,
        atmo,
        maxDistanceYd: state.card.endDistanceYd,
        stepYd: state.card.incrementYd,
        bulletWeightGr: state.version.bulletWeightGr,
      },
      observations,
      turretUnit: rifle.turretUnit,
    });
    if (trued != null) {
      await setCardMvOverride(state.card.id, trued);
      refresh();
    }
    return trued;
  }, [state.card, state.version, state.mvFps, rifle, loadVersionId, refresh]);

  const clearTrueUp = useCallback(async () => {
    if (!state.card) return;
    await setCardMvOverride(state.card.id, null);
    refresh();
  }, [state.card, refresh]);

  return { ...state, refresh, changePreset, trueUp, clearTrueUp };
}

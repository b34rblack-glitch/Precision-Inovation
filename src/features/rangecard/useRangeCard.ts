import { useCallback, useEffect, useState } from 'react';
import {
  getOrCreateCard,
  setCardBallistics,
  setCardBcScale,
  setCardDistances,
  setCardMvOverride,
  setCardPreset,
} from '@/db/repositories/rangeCards';
import { getVersionById } from '@/db/repositories/loads';
import {
  confirmedDopeForRifleLoad,
  latestMeasuredMv,
  latestSessionAtmo,
  latestSessionWind,
} from '@/db/repositories/sessions';
import { adjustMvForTemp } from '@/lib/ballistics/mvTemp';
import { BallisticInput } from '@/lib/ballistics/types';
import {
  buildCardRows,
  CardRow,
  DRAG_TRUE_MIN_YD,
  MV_TRUE_MIN_YD,
  ObservedDope,
  trueDragScale,
  trueMuzzleVelocity,
} from '@/lib/rangecard/merge';
import { CardPreset } from '@/lib/rangecard/presets';
import { parseTwistRate } from '@/lib/units';
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

type SessionWind = {
  windSpeedMph: number | null;
  windDirClock: number | null;
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

export type LoggedWind = {
  speedMph: number;
  dirClock: number;
  /** Full-value crosswind, mph, in the solver's sign (+ = wind from the LEFT). */
  crossMph: number;
};

export type CardAdvanced = {
  spinActive: boolean;
  coriolisActive: boolean;
  inclineDeg: number | null;
};

const ADVANCED_OFF: CardAdvanced = { spinActive: false, coriolisActive: false, inclineDeg: null };

/**
 * Convert the latest logged session wind (speed + the clock direction the
 * wind blows FROM) into the solver's crosswind sign convention, where
 * positive = wind FROM the left (blowing left→right):
 *   crossMph = −speed · sin(clock · 30°)
 * so 3 o'clock (wind from the right) → NEGATIVE, 9 o'clock → positive,
 * 12/6 o'clock (head/tail wind) → ~0. A missing direction defaults to 12.
 */
function resolveLoggedWind(card: RangeCard, wind: SessionWind | null): LoggedWind | null {
  if (!card.useLoggedWind || wind?.windSpeedMph == null) return null;
  const dirClock = wind.windDirClock ?? 12;
  // % 12 keeps 12 o'clock at an exact 0° (sin(360°) is not exactly 0 in FP).
  const clockRad = ((dirClock % 12) * 30 * Math.PI) / 180;
  return {
    speedMph: wind.windSpeedMph,
    dirClock,
    crossMph: -wind.windSpeedMph * Math.sin(clockRad),
  };
}

type SolverExtras = Pick<
  BallisticInput,
  'bcSegments' | 'spin' | 'coriolis' | 'inclineDeg' | 'aeroJumpCrossMph' | 'bcScale'
>;

/**
 * Advanced solver inputs derived from the card + load version + rifle. Used
 * for both the displayed rows and MV truing so truing solves against exactly
 * the physics the card shows.
 */
function solverExtras(
  card: RangeCard,
  version: LoadVersion,
  rifle: Rifle,
  loggedWind: LoggedWind | null,
): SolverExtras {
  const segments = Array.isArray(version.bcSegments)
    ? version.bcSegments.filter(
        (s) => Number.isFinite(s?.minVelocityFps) && Number.isFinite(s?.bc) && s.bc > 0,
      )
    : [];
  const twistInPerTurn = parseTwistRate(rifle.twistRate ?? '');
  const spin =
    card.spinDriftEnabled &&
    twistInPerTurn != null &&
    version.bulletLengthIn != null &&
    version.bulletLengthIn > 0 &&
    version.bulletDiameterIn != null &&
    version.bulletDiameterIn > 0 &&
    version.bulletWeightGr != null &&
    version.bulletWeightGr > 0
      ? {
          twistInPerTurn,
          // Rifles saved before twist direction existed read back as null;
          // right-hand is the safe default (virtually all factory barrels are RH).
          twistRight: rifle.twistRight ?? true,
          bulletLengthIn: version.bulletLengthIn,
          bulletDiameterIn: version.bulletDiameterIn,
        }
      : undefined;
  return {
    bcSegments: segments.length > 0 ? segments : undefined,
    spin,
    coriolis:
      card.latitudeDeg != null && card.azimuthDeg != null
        ? { latitudeDeg: card.latitudeDeg, azimuthDeg: card.azimuthDeg }
        : undefined,
    inclineDeg: card.inclineDeg ?? undefined,
    // Aero jump needs spin — the solver silently skips it otherwise.
    aeroJumpCrossMph: spin && loggedWind ? loggedWind.crossMph : undefined,
    // Stage-2 truing: scales the BC (1 = published) so the displayed card and
    // any further truing both solve against the calibrated drag.
    bcScale: card.bcScaleFactor ?? undefined,
  };
}

/**
 * Which truing stage to run. 'mv' back-solves muzzle velocity (correct when
 * there is no chronograph data); 'drag' back-solves a BC scale factor with MV
 * held fixed (correct once MV is known from a chrono, because the residual
 * long-range error is then the drag model rather than the speed).
 */
export type TrueUpMode = 'mv' | 'drag';

export type TrueUpResult =
  | { mode: 'mv'; mvFps: number }
  | { mode: 'drag'; bcScale: number }
  | { mode: 'none'; reason: string };

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
  /** True when mvFps was shifted for powder temperature (never for trued MV). */
  mvTempAdjusted: boolean;
  /** Latest session wind, resolved to the solver's crosswind sign; null unless useLoggedWind. */
  loggedWind: LoggedWind | null;
  /** Which advanced effects actually made it into the solve. */
  advanced: CardAdvanced;
  confirmedCount: number;
  refresh: () => void;
  changePreset: (p: CardPreset) => Promise<void>;
  changeDistances: (startYd: number, endYd: number, incrementYd: number) => Promise<void>;
  setBallistics: (values: Parameters<typeof setCardBallistics>[1]) => Promise<void>;
  /** Active drag scale factor (BC multiplier); null = published BC. */
  bcScale: number | null;
  trueUp: (mode: TrueUpMode) => Promise<TrueUpResult>;
  clearTrueUp: () => Promise<void>;
  clearBcScale: () => Promise<void>;
};

export function useRangeCard(rifle: Rifle | undefined, loadVersionId: string | null): RangeCardState {
  const [state, setState] = useState<
    Omit<
      RangeCardState,
      | 'refresh'
      | 'changePreset'
      | 'changeDistances'
      | 'setBallistics'
      | 'trueUp'
      | 'clearTrueUp'
      | 'clearBcScale'
    >
  >({
    status: 'loading',
    errorMessage: null,
    missing: [],
    card: null,
    version: null,
    rows: [],
    mvSource: null,
    mvFps: null,
    mvTempAdjusted: false,
    loggedWind: null,
    advanced: ADVANCED_OFF,
    confirmedCount: 0,
    bcScale: null,
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
      mvTempAdjusted: false,
      loggedWind: null,
      advanced: ADVANCED_OFF,
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
          mvTempAdjusted: false,
          loggedWind: null,
          advanced: ADVANCED_OFF,
          confirmedCount: 0,
          bcScale: null,
        });
        return;
      }
      const [card, version, observedRaw, sessionAtmo, sessionWind] = await Promise.all([
        getOrCreateCard(rifle.id, loadVersionId, rifle.distanceUnit),
        getVersionById(loadVersionId),
        confirmedDopeForRifleLoad(rifle.id, loadVersionId),
        latestSessionAtmo(loadVersionId),
        latestSessionWind(loadVersionId),
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

      // Powder-temp MV adjustment, against the session temperature actually
      // driving the atmosphere below. A trued MV (override) is never
      // re-adjusted — truing already absorbed the day's conditions. With no
      // logged session temp the atmosphere falls back to ICAO and the MV
      // stays unadjusted (null actual temp is a no-op in adjustMvForTemp).
      let mvTempAdjusted = false;
      if (mvFps != null && mvSource !== 'override' && version) {
        const resolvedAtmoTempF = sessionAtmo?.tempF ?? null;
        const adjusted = adjustMvForTemp(
          mvFps,
          version.mvTempRefF,
          version.mvTempSensFpsPerDegF,
          resolvedAtmoTempF,
        );
        mvTempAdjusted = adjusted !== mvFps;
        mvFps = adjusted;
      }

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
          mvTempAdjusted,
          loggedWind: null,
          advanced: ADVANCED_OFF,
          confirmedCount: 0,
          bcScale: card.bcScaleFactor ?? null,
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
          mvTempAdjusted,
          loggedWind: null,
          advanced: ADVANCED_OFF,
          confirmedCount: 0,
          bcScale: card.bcScaleFactor ?? null,
        });
        return;
      }

      // Resolve atmosphere at build time from the latest logged session for
      // this load (do not persist a stale snapshot); ICAO if none exists.
      const atmo = resolveAtmo(sessionAtmo);
      const loggedWind = resolveLoggedWind(card, sessionWind);
      const extras = solverExtras(card, version, rifle, loggedWind);
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
          ...extras,
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
        mvTempAdjusted,
        loggedWind,
        advanced: {
          spinActive: extras.spin != null,
          coriolisActive: extras.coriolis != null,
          inclineDeg: card.inclineDeg,
        },
        confirmedCount: rows.filter((r) => r.confirmed).length,
        bcScale: card.bcScaleFactor ?? null,
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

  const trueUp = useCallback(
    async (mode: TrueUpMode): Promise<TrueUpResult> => {
    if (!state.card || !state.version || !rifle || state.mvFps == null || !loadVersionId)
      return { mode: 'none', reason: 'The card is still loading.' };
    const [observedRaw, sessionAtmo, sessionWind] = await Promise.all([
      confirmedDopeForRifleLoad(rifle.id, loadVersionId),
      latestSessionAtmo(loadVersionId),
      latestSessionWind(loadVersionId),
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
    // Same advanced physics as the displayed card, and state.mvFps is already
    // the temp-adjusted base — so the search only explains what the display
    // solve doesn't.
    const loggedWind = resolveLoggedWind(state.card, sessionWind);
    const extras = solverExtras(state.card, state.version, rifle, loggedWind);
    const solverInput = {
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
      ...extras,
    };

    if (mode === 'drag') {
      const scale = trueDragScale({ solverInput, observations, turretUnit: rifle.turretUnit });
      if (scale == null) {
        return {
          mode: 'none',
          reason: `Drag truing needs a confirmed hold at ${DRAG_TRUE_MIN_YD}+ yards, where BC error actually shows up.`,
        };
      }
      await setCardBcScale(state.card.id, scale);
      refresh();
      return { mode: 'drag', bcScale: scale };
    }

    const trued = trueMuzzleVelocity({ solverInput, observations, turretUnit: rifle.turretUnit });
    if (trued == null) {
      return {
        mode: 'none',
        reason: `Velocity truing needs a confirmed hold at ${MV_TRUE_MIN_YD}+ yards.`,
      };
    }
    await setCardMvOverride(state.card.id, trued);
    refresh();
    return { mode: 'mv', mvFps: trued };
  }, [state.card, state.version, state.mvFps, rifle, loadVersionId, refresh]);

  const clearTrueUp = useCallback(async () => {
    if (!state.card) return;
    await setCardMvOverride(state.card.id, null);
    refresh();
  }, [state.card, refresh]);

  /** Reset stage-2 drag truing back to the published BC. */
  const clearBcScale = useCallback(async () => {
    if (!state.card) return;
    await setCardBcScale(state.card.id, null);
    refresh();
  }, [state.card, refresh]);

  // Custom start/end/increment (canonical yards). Overrides the preset's grid.
  const changeDistances = useCallback(
    async (startYd: number, endYd: number, incrementYd: number) => {
      if (!state.card) return;
      await setCardDistances(state.card.id, startYd, endYd, incrementYd);
      refresh();
    },
    [state.card, refresh],
  );

  // Advanced-ballistics settings (Coriolis / incline / spin / logged wind).
  const setBallistics = useCallback(
    async (values: Parameters<typeof setCardBallistics>[1]) => {
      if (!state.card) return;
      await setCardBallistics(state.card.id, values);
      refresh();
    },
    [state.card, refresh],
  );

  return {
    ...state,
    refresh,
    changePreset,
    changeDistances,
    setBallistics,
    trueUp,
    clearTrueUp,
    clearBcScale,
  };
}

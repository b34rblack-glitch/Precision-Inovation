// Importable workspace: two rifles with their factory hunting loads, the
// Phoenix Rod and Gun Club zero session for each (4 Oct 2026, 10:00), a
// confirmed 100 yd zero entry, and a bench range card to 1,000 yd.
//
//   SIG CROSS Magnum .300 Win Mag        Federal Terminal Ascent 175 gr
//   Christensen Arms MPR .300 PRC        Hornady Precision Hunter 212 gr ELD-X
//
// Pure builder — no I/O, no database — so a test can restore it into the real
// schema. `scripts/write-workspace-phoenix.ts` writes it to docs/range-cards/.
//
// Settings → Import Backup REPLACES everything in the app. Anyone with
// existing data must export first and merge this file's rows into that export.
import type { Backup } from '@/lib/backup';
import type {
  DopeEntry,
  Load,
  LoadVersion,
  RangeCard,
  RangeSession,
  Rifle,
} from '@/db/schema';

// Fixed ids so the file is reproducible and a re-import is byte-identical.
const idFor = (rifle: 1 | 2, row: number) =>
  `7c1e9d3a-5b2f-4c8e-9a1d-300f17${rifle}0a00${row}`;

export const IDS = {
  cross: {
    rifle: idFor(1, 1),
    load: idFor(1, 2),
    loadVersion: idFor(1, 3),
    session: idFor(1, 4),
    dope: idFor(1, 5),
    card: idFor(1, 6),
  },
  mpr: {
    rifle: idFor(2, 1),
    load: idFor(2, 2),
    loadVersion: idFor(2, 3),
    session: idFor(2, 4),
    dope: idFor(2, 5),
    card: idFor(2, 6),
  },
} as const;

/** File timestamp (rows created). */
const STAMP = new Date('2026-10-24T12:00:00.000Z');
/** Zero session: 4 Oct 2026, 10:00 MST (Arizona does not observe DST). */
export const ZERO_DATE = new Date('2026-10-04T17:00:00.000Z');

export const ZERO_RANGE = {
  location: 'Phoenix Rod and Gun Club',
  // Typical for that morning (lows mid-70s, high near 96 °F); not measured.
  tempF: 85,
  altitudeFt: 1100,
  pressureInHg: 28.75, // station pressure at about 1,100 ft on a standard day
  humidityPct: 25,
} as const;

type RifleSpec = {
  ids: (typeof IDS)[keyof typeof IDS];
  rifle: Omit<Rifle, 'id' | 'createdAt' | 'updatedAt' | 'archivedAt' | 'photoUri' | 'photoSha256'>;
  loadName: string;
  version: Pick<
    LoadVersion,
    | 'bulletMake'
    | 'bulletModel'
    | 'bulletWeightGr'
    | 'bcValue'
    | 'bcModel'
    | 'bulletLengthIn'
    | 'bulletDiameterIn'
    | 'brass'
    | 'muzzleVelocityFps'
    | 'notes'
  >;
  zeroNotes: string;
};

export const CROSS: RifleSpec = {
  ids: IDS.cross,
  rifle: {
    name: 'SIG CROSS Magnum .300 Win Mag',
    make: 'SIG SAUER',
    model: 'CROSS Magnum',
    cartridge: '.300 Win Mag',
    barrelLengthIn: 24,
    twistRate: '1:9',
    twistRight: true,
    scopeMake: 'Leupold',
    scopeModel: 'Mark 4HD 4.5-18x52 FFP PR1-MIL (34 mm, SIG ALPHA6 extra-high rings)',
    // 1.25 in ALPHA6 extra-high (rail top to optic centerline, per SIG) plus an
    // estimated 0.85 in from bore center to the top of the CROSS's integral rail.
    sightHeightIn: 2.1,
    turretUnit: 'MIL',
    distanceUnit: 'yd',
    zeroDistance: 100,
    notes:
      'Zeroed at 100 yd, Phoenix Rod and Gun Club, 4 Oct 2026, with Federal Terminal Ascent 175 gr. ' +
      'Sight height 2.1 in is an estimate (1.25 in rings + about 0.85 in bore to rail top): measure bore center to scope-tube center and update it.',
  },
  loadName: 'Federal Terminal Ascent 175 gr (factory)',
  version: {
    bulletMake: 'Federal',
    bulletModel: 'Terminal Ascent',
    bulletWeightGr: 175,
    bcValue: 0.258,
    bcModel: 'G7',
    bulletLengthIn: 1.466,
    bulletDiameterIn: 0.308,
    brass: 'Federal',
    // Federal published, 24 in test barrel. Replace with a chrono average.
    muzzleVelocityFps: 3030,
    notes:
      'Factory ammunition, Federal P300WTA2. Published 3,030 fps (24 in test barrel), G7 .258 / G1 .520. ' +
      'Bullet length and diameter are entered so spin drift is modeled.',
  },
  zeroNotes: '100 yd zero confirmed with Federal Terminal Ascent 175 gr.',
};

export const MPR: RifleSpec = {
  ids: IDS.mpr,
  rifle: {
    name: 'Christensen Arms MPR .300 PRC',
    make: 'Christensen Arms',
    model: 'MPR (Modern Precision Rifle)',
    cartridge: '.300 PRC',
    barrelLengthIn: 26,
    twistRate: '1:8',
    twistRight: true,
    scopeMake: 'Leupold',
    scopeModel: 'Mark 5HD 7-35x56 M1C3 1/4 MOA (35 mm, Mark 4 35 mm high rings #120180)',
    // 1.06 in Mark 4 high rings (per Leupold) plus an estimated 0.85 in from
    // bore center to the top of the MPR's rail.
    sightHeightIn: 1.9,
    turretUnit: 'MOA',
    distanceUnit: 'yd',
    zeroDistance: 100,
    notes:
      'Zeroed at 100 yd, Phoenix Rod and Gun Club, 4 Oct 2026, with Hornady Precision Hunter 212 gr ELD-X. ' +
      'Sight height 1.9 in is an estimate (1.06 in rings + about 0.85 in bore to rail top): measure bore center to scope-tube center and update it.',
  },
  loadName: 'Hornady Precision Hunter 212 gr ELD-X (factory)',
  version: {
    bulletMake: 'Hornady',
    bulletModel: 'ELD-X',
    bulletWeightGr: 212,
    bcValue: 0.336,
    bcModel: 'G7',
    // Hornady does not publish the length; 1.60 in is scaled from the 212 ELD-X
    // profile and only feeds the spin-drift estimate.
    bulletLengthIn: 1.6,
    bulletDiameterIn: 0.308,
    brass: 'Hornady',
    // Hornady published, 24 in test barrel; the MPR's 26 in barrel may run faster.
    muzzleVelocityFps: 2860,
    notes:
      'Factory ammunition, Hornady Precision Hunter #82166. Published 2,860 fps (24 in test barrel), G7 .336 / G1 .673. ' +
      'Bullet length is an estimate; it only affects the spin-drift term.',
  },
  zeroNotes: '100 yd zero confirmed with Hornady Precision Hunter 212 gr ELD-X.',
};

function rowsFor(spec: RifleSpec) {
  const t = STAMP;
  const { ids } = spec;
  const rifle: Rifle = {
    id: ids.rifle,
    ...spec.rifle,
    photoUri: null,
    photoSha256: null,
    createdAt: t,
    updatedAt: t,
    archivedAt: null,
  };
  const load: Load = {
    id: ids.load,
    name: spec.loadName,
    cartridge: spec.rifle.cartridge,
    rifleId: ids.rifle,
    currentVersionId: ids.loadVersion,
    createdAt: t,
    updatedAt: t,
    archivedAt: null,
  };
  const loadVersion: LoadVersion = {
    id: ids.loadVersion,
    loadId: ids.load,
    versionNumber: 1,
    parentVersionId: null,
    bulletMake: spec.version.bulletMake,
    bulletModel: spec.version.bulletModel,
    bulletWeightGr: spec.version.bulletWeightGr,
    bcValue: spec.version.bcValue,
    bcModel: spec.version.bcModel,
    bulletLengthIn: spec.version.bulletLengthIn,
    bulletDiameterIn: spec.version.bulletDiameterIn,
    bcSegments: null,
    powderName: null,
    chargeGr: null,
    primer: null,
    brass: spec.version.brass,
    brassFirings: null,
    cbtoIn: null,
    coalIn: null,
    crimp: null,
    muzzleVelocityFps: spec.version.muzzleVelocityFps,
    mvTempRefF: null,
    mvTempSensFpsPerDegF: null,
    caseTrimLengthIn: null,
    caseTrimmedTo: null,
    caseNeckTurned: false,
    neckWallThicknessIn: null,
    casePrepNotes: null,
    primerPocketUniformed: false,
    flashHoleDeburred: false,
    caseVolumeGrH2O: null,
    caseWeightGr: null,
    caseAnnealed: false,
    annealMethod: null,
    caseLotNumber: null,
    sizingDie: null,
    sizingDieType: null,
    bushingSizeIn: null,
    expanderMandrelIn: null,
    shoulderBumpIn: null,
    seatingDie: null,
    seatingDieMicrometer: null,
    crimpDie: null,
    pressName: null,
    lubeMethod: null,
    powderLotNumber: null,
    chargeMethod: null,
    chargeVarianceGr: null,
    primerLotNumber: null,
    primerSeatingDepthIn: null,
    bulletLotNumber: null,
    bulletSortedBy: null,
    jumpToLandsIn: null,
    neckTensionIn: null,
    runoutIn: null,
    loadedRoundWeightGr: null,
    assemblyNotes: null,
    notes: spec.version.notes,
    createdAt: t,
    updatedAt: t,
  };
  // The zero session carries the conditions the range card solves against
  // (the app takes its atmosphere from the latest logged session for a load).
  const session: RangeSession = {
    id: ids.session,
    rifleId: ids.rifle,
    loadVersionId: ids.loadVersion,
    date: ZERO_DATE,
    location: ZERO_RANGE.location,
    tempF: ZERO_RANGE.tempF,
    pressureInHg: ZERO_RANGE.pressureInHg,
    altitudeFt: ZERO_RANGE.altitudeFt,
    humidityPct: ZERO_RANGE.humidityPct,
    windSpeedMph: null,
    windDirClock: null,
    targetPhotoUri: null,
    targetPhotoSha256: null,
    notes:
      spec.zeroNotes +
      ' Conditions are typical values for that morning, not measured: edit them to what the day actually was.',
    createdAt: t,
    updatedAt: t,
    archivedAt: null,
  };
  const dope: DopeEntry = {
    id: ids.dope,
    sessionId: ids.session,
    distanceYd: 100,
    elevationHold: 0,
    windageHold: 0,
    holdUnit: spec.rifle.turretUnit,
    groupSizeIn: null,
    poiUpIn: 0,
    poiRightIn: 0,
    confirmed: true,
    notes: 'Zero',
    createdAt: t,
    updatedAt: t,
  };
  const card: RangeCard = {
    id: ids.card,
    rifleId: ids.rifle,
    loadVersionId: ids.loadVersion,
    preset: 'bench',
    startDistanceYd: 100,
    endDistanceYd: 1000,
    incrementYd: 50,
    mvOverrideFps: null,
    bcScaleFactor: null,
    atmoSnapshot: null,
    latitudeDeg: null,
    azimuthDeg: null,
    inclineDeg: null,
    useLoggedWind: false,
    spinDriftEnabled: true,
    createdAt: t,
    updatedAt: t,
    archivedAt: null,
  };
  return { rifle, load, loadVersion, session, dope, card };
}

export function buildWorkspace(): Backup {
  const sets = [CROSS, MPR].map(rowsFor);
  return {
    // Type-only import above: @/lib/backup pulls in the Expo database client,
    // which node cannot load. The test pins this to BACKUP_SCHEMA_VERSION.
    schemaVersion: 1,
    exportedAt: STAMP.toISOString(),
    app: 'precision-innovation',
    tables: {
      rifles: sets.map((s) => s.rifle),
      loads: sets.map((s) => s.load),
      loadVersions: sets.map((s) => s.loadVersion),
      workups: [],
      workupSteps: [],
      rangeSessions: sets.map((s) => s.session),
      shotStrings: [],
      shots: [],
      dopeEntries: sets.map((s) => s.dope),
      rangeCards: sets.map((s) => s.card),
    },
  };
}

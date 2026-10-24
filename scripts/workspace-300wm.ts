// Importable workspace: the SIG CROSS Magnum (.300 Win Mag) with Federal
// Terminal Ascent 175 gr, its 100 yd Phoenix zero session, and a bench range
// card, as a Precision Innovation backup file.
//
// Pure builder — no I/O, no database — so a test can restore it into the real
// schema. `scripts/write-workspace-300wm.ts` writes it to docs/range-cards/.
//
// Settings → Import Backup REPLACES everything in the app. Anyone with
// existing data must export first and merge this file's rows into that export.
// Type-only: @/lib/backup pulls in the Expo database client, which node cannot
// load. __tests__/rangecard/workspace300wm.test.ts pins schemaVersion to
// BACKUP_SCHEMA_VERSION.
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
export const IDS = {
  rifle: '7c1e9d3a-5b2f-4c8e-9a1d-300f1750a001',
  load: '7c1e9d3a-5b2f-4c8e-9a1d-300f1750a002',
  loadVersion: '7c1e9d3a-5b2f-4c8e-9a1d-300f1750a003',
  session: '7c1e9d3a-5b2f-4c8e-9a1d-300f1750a004',
  dope: '7c1e9d3a-5b2f-4c8e-9a1d-300f1750a005',
  card: '7c1e9d3a-5b2f-4c8e-9a1d-300f1750a006',
} as const;

const STAMP = new Date('2026-10-24T12:00:00.000Z');

export function buildWorkspace(): Backup {
  const t = STAMP;

  const rifle: Rifle = {
    id: IDS.rifle,
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
    photoUri: null,
    photoSha256: null,
    notes:
      'Zeroed at 100 yd in Phoenix with Federal Terminal Ascent 175 gr. ' +
      'Sight height 2.1 in is an estimate (1.25 in rings + about 0.85 in bore to rail top): measure bore center to scope-tube center and update it.',
    createdAt: t,
    updatedAt: t,
    archivedAt: null,
  };

  const load: Load = {
    id: IDS.load,
    name: 'Federal Terminal Ascent 175 gr (factory)',
    cartridge: '.300 Win Mag',
    rifleId: IDS.rifle,
    currentVersionId: IDS.loadVersion,
    createdAt: t,
    updatedAt: t,
    archivedAt: null,
  };

  const loadVersion: LoadVersion = {
    id: IDS.loadVersion,
    loadId: IDS.load,
    versionNumber: 1,
    parentVersionId: null,
    bulletMake: 'Federal',
    bulletModel: 'Terminal Ascent',
    bulletWeightGr: 175,
    bcValue: 0.258,
    bcModel: 'G7',
    bulletLengthIn: 1.466,
    bulletDiameterIn: 0.308,
    bcSegments: null,
    powderName: null,
    chargeGr: null,
    primer: null,
    brass: 'Federal',
    brassFirings: null,
    cbtoIn: null,
    coalIn: null,
    crimp: null,
    // Federal published, 24 in test barrel. Replace with a chrono average.
    muzzleVelocityFps: 3030,
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
    notes:
      'Factory ammunition, Federal P300WTA2. Published 3,030 fps (24 in test barrel), G7 .258 / G1 .520. ' +
      'Bullet length and diameter are entered so spin drift is modeled.',
    createdAt: t,
    updatedAt: t,
  };

  // The zero session carries the conditions the range card solves against
  // (the app takes its atmosphere from the latest logged session for a load).
  const session: RangeSession = {
    id: IDS.session,
    rifleId: IDS.rifle,
    loadVersionId: IDS.loadVersion,
    date: t,
    location: 'Phoenix, AZ',
    tempF: 75,
    pressureInHg: 28.75, // station pressure at about 1,100 ft on a standard day
    altitudeFt: 1100,
    humidityPct: 20,
    windSpeedMph: null,
    windDirClock: null,
    targetPhotoUri: null,
    targetPhotoSha256: null,
    notes:
      '100 yd zero. Conditions are typical Phoenix values, not measured on the day: edit them, and the date, to match the actual zero session.',
    createdAt: t,
    updatedAt: t,
    archivedAt: null,
  };

  const dope: DopeEntry = {
    id: IDS.dope,
    sessionId: IDS.session,
    distanceYd: 100,
    elevationHold: 0,
    windageHold: 0,
    holdUnit: 'MIL',
    groupSizeIn: null,
    poiUpIn: 0,
    poiRightIn: 0,
    confirmed: true,
    notes: 'Zero',
    createdAt: t,
    updatedAt: t,
  };

  const card: RangeCard = {
    id: IDS.card,
    rifleId: IDS.rifle,
    loadVersionId: IDS.loadVersion,
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

  return {
    schemaVersion: 1,
    exportedAt: t.toISOString(),
    app: 'precision-innovation',
    tables: {
      rifles: [rifle],
      loads: [load],
      loadVersions: [loadVersion],
      workups: [],
      workupSteps: [],
      rangeSessions: [session],
      shotStrings: [],
      shots: [],
      dopeEntries: [dope],
      rangeCards: [card],
    },
  };
}

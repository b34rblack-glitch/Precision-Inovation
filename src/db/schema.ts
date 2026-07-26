import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Canonical storage units across the whole schema: grains, inches, fps, °F,
// yards, inHg, feet. Conversion to a rifle's display units happens in the UI
// layer via src/lib/units.ts. Exception: rifles.zeroDistance is stored in the
// rifle's own display distance unit (yd or m), not canonical yards — see below.

const id = () => text('id').primaryKey();
const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
};
const archivable = {
  archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
};

export const rifles = sqliteTable('rifles', {
  id: id(),
  name: text('name').notNull(),
  make: text('make'),
  model: text('model'),
  cartridge: text('cartridge'),
  barrelLengthIn: real('barrel_length_in'),
  twistRate: text('twist_rate'),
  // Spin drift and aerodynamic jump both flip sign with twist direction, so a
  // left-hand barrel gets them backwards unless this is recorded. Almost every
  // factory barrel is right-hand, hence the default.
  twistRight: integer('twist_right', { mode: 'boolean' }).notNull().default(true),
  scopeMake: text('scope_make'),
  scopeModel: text('scope_model'),
  sightHeightIn: real('sight_height_in').notNull().default(1.9),
  turretUnit: text('turret_unit', { enum: ['MIL', 'MOA'] }).notNull().default('MIL'),
  distanceUnit: text('distance_unit', { enum: ['yd', 'm'] }).notNull().default('yd'),
  // Stored in the rifle's DISPLAY distance unit (yd or m), NOT canonical yards.
  // Consumers needing yards convert m -> yd via /0.9144 (see src/lib/units.ts).
  zeroDistance: real('zero_distance').notNull().default(100),
  photoUri: text('photo_uri'),
  notes: text('notes'),
  ...timestamps,
  ...archivable,
});

export const loads = sqliteTable(
  'loads',
  {
    id: id(),
    name: text('name').notNull(),
    cartridge: text('cartridge'),
    rifleId: text('rifle_id').references(() => rifles.id),
    currentVersionId: text('current_version_id'),
    ...timestamps,
    ...archivable,
  },
  (t) => [index('loads_rifle_idx').on(t.rifleId)],
);

// Immutable once referenced by a session or workup; copy-on-write creates the
// next versionNumber and loads.currentVersionId is bumped.
export const loadVersions = sqliteTable(
  'load_versions',
  {
    id: id(),
    loadId: text('load_id')
      .notNull()
      .references(() => loads.id),
    versionNumber: integer('version_number').notNull(),
    parentVersionId: text('parent_version_id'),
    bulletMake: text('bullet_make'),
    bulletModel: text('bullet_model'),
    bulletWeightGr: real('bullet_weight_gr'),
    bcValue: real('bc_value'),
    bcModel: text('bc_model', { enum: ['G1', 'G7'] }),
    bulletLengthIn: real('bullet_length_in'), // inches; needed for spin-drift estimate
    bulletDiameterIn: real('bullet_diameter_in'), // inches; needed for spin-drift estimate
    // Velocity-banded BC: JSON array of { minVelocityFps, bc } (fps + BC in the
    // same G-model as bcModel). Null means use the single bcValue everywhere.
    bcSegments: text('bc_segments', { mode: 'json' }).$type<
      { minVelocityFps: number; bc: number }[]
    >(),
    powderName: text('powder_name'),
    chargeGr: real('charge_gr'),
    primer: text('primer'),
    brass: text('brass'),
    brassFirings: integer('brass_firings'),
    cbtoIn: real('cbto_in'),
    coalIn: real('coal_in'),
    crimp: text('crimp'),
    muzzleVelocityFps: real('muzzle_velocity_fps'),
    mvTempRefF: real('mv_temp_ref_f'), // °F; powder temp at which muzzleVelocityFps was measured
    mvTempSensFpsPerDegF: real('mv_temp_sens_fps_per_deg_f'), // fps per °F; powder temp sensitivity

    // Competition/ELR recipe detail. Every field below is optional — a load is
    // fully usable without any of it — but a match shooter documenting a
    // reproducible recipe can record the whole process here.

    // Case prep
    caseTrimLengthIn: real('case_trim_length_in'), // inches; trimmed case length
    caseTrimmedTo: text('case_trimmed_to'), // trimmer/method, e.g. "Giraud", "Wilson + micrometer"
    caseNeckTurned: integer('case_neck_turned', { mode: 'boolean' }).default(false),
    neckWallThicknessIn: real('neck_wall_thickness_in'), // inches; neck wall after turning
    casePrepNotes: text('case_prep_notes'), // chamfer/deburr/uniforming detail
    primerPocketUniformed: integer('primer_pocket_uniformed', { mode: 'boolean' }).default(false),
    flashHoleDeburred: integer('flash_hole_deburred', { mode: 'boolean' }).default(false),
    caseVolumeGrH2O: real('case_volume_gr_h2o'), // grains of water; case capacity
    caseWeightGr: real('case_weight_gr'), // grains; sorted case weight
    caseAnnealed: integer('case_annealed', { mode: 'boolean' }).default(false),
    annealMethod: text('anneal_method'), // e.g. "AMP mode 62", "salt bath"
    caseLotNumber: text('case_lot_number'),

    // Dies & press
    sizingDie: text('sizing_die'),
    sizingDieType: text('sizing_die_type'), // free text: 'full-length' | 'neck' | 'body'
    bushingSizeIn: real('bushing_size_in'), // inches; neck bushing ID
    expanderMandrelIn: real('expander_mandrel_in'), // inches; expander mandrel diameter
    shoulderBumpIn: real('shoulder_bump_in'), // inches; shoulder set back from the fired case
    seatingDie: text('seating_die'),
    seatingDieMicrometer: text('seating_die_micrometer'), // micrometer setting as marked on the die
    crimpDie: text('crimp_die'), // the die itself; `crimp` above stays the crimp description
    pressName: text('press_name'),
    lubeMethod: text('lube_method'),

    // Charge process (powder temp lives in mvTempRefF/mvTempSensFpsPerDegF above)
    powderLotNumber: text('powder_lot_number'),
    chargeMethod: text('charge_method'), // e.g. "Autotrickler V4", "thrown + trickled"
    chargeVarianceGr: real('charge_variance_gr'), // grains; +/- tolerance held while charging

    // Priming & seating
    primerLotNumber: text('primer_lot_number'),
    primerSeatingDepthIn: real('primer_seating_depth_in'), // inches below flush
    bulletLotNumber: text('bullet_lot_number'),
    bulletSortedBy: text('bullet_sorted_by'), // e.g. "base-to-ogive", "weight ±0.1gr"
    jumpToLandsIn: real('jump_to_lands_in'), // inches of freebore jump; negative = jammed in
    neckTensionIn: real('neck_tension_in'), // inches of interference fit

    // Assembly QC
    runoutIn: real('runout_in'), // inches; measured concentricity TIR
    loadedRoundWeightGr: real('loaded_round_weight_gr'), // grains; total loaded round weight
    assemblyNotes: text('assembly_notes'),

    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('load_versions_load_idx').on(t.loadId)],
);

export const workups = sqliteTable(
  'workups',
  {
    id: id(),
    rifleId: text('rifle_id')
      .notNull()
      .references(() => rifles.id),
    loadId: text('load_id')
      .notNull()
      .references(() => loads.id),
    baseVersionId: text('base_version_id').references(() => loadVersions.id),
    type: text('type', { enum: ['ladder', 'ocw', 'velocity', 'freeform'] }).notNull(),
    startChargeGr: real('start_charge_gr'),
    incrementGr: real('increment_gr'),
    stepCount: integer('step_count'),
    shotsPerCharge: integer('shots_per_charge'),
    distanceYd: real('distance_yd'),
    status: text('status', { enum: ['planned', 'in_progress', 'complete'] })
      .notNull()
      .default('planned'),
    resultLoadVersionId: text('result_load_version_id').references(() => loadVersions.id),
    notes: text('notes'),
    ...timestamps,
    ...archivable,
  },
  (t) => [index('workups_load_idx').on(t.loadId)],
);

export const workupSteps = sqliteTable(
  'workup_steps',
  {
    id: id(),
    workupId: text('workup_id')
      .notNull()
      .references(() => workups.id),
    seq: integer('seq').notNull(),
    chargeGr: real('charge_gr').notNull(),
    groupSizeIn: real('group_size_in'),
    poiXIn: real('poi_x_in'),
    poiYIn: real('poi_y_in'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('workup_steps_workup_idx').on(t.workupId)],
);

// Chronograph string. Owned by exactly one of workupStepId / sessionId.
// Summary fields are entered manually when no per-shot data exists, and are
// recomputed + cached whenever per-shot rows change. source stays 'manual'
// until a CSV importer lands (it will write the same rows with source 'csv').
export const shotStrings = sqliteTable(
  'shot_strings',
  {
    id: id(),
    workupStepId: text('workup_step_id').references(() => workupSteps.id),
    sessionId: text('session_id').references(() => rangeSessions.id),
    avgFps: real('avg_fps'),
    sdFps: real('sd_fps'),
    esFps: real('es_fps'),
    shotCount: integer('shot_count'),
    source: text('source', { enum: ['manual', 'csv'] }).notNull().default('manual'),
    deviceName: text('device_name'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    index('shot_strings_step_idx').on(t.workupStepId),
    index('shot_strings_session_idx').on(t.sessionId),
  ],
);

export const shots = sqliteTable(
  'shots',
  {
    id: id(),
    stringId: text('string_id')
      .notNull()
      .references(() => shotStrings.id),
    seq: integer('seq').notNull(),
    velocityFps: real('velocity_fps').notNull(),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('shots_string_idx').on(t.stringId)],
);

export const rangeSessions = sqliteTable(
  'range_sessions',
  {
    id: id(),
    rifleId: text('rifle_id')
      .notNull()
      .references(() => rifles.id),
    loadVersionId: text('load_version_id').references(() => loadVersions.id),
    date: integer('date', { mode: 'timestamp_ms' }).notNull(),
    location: text('location'),
    tempF: real('temp_f'),
    pressureInHg: real('pressure_in_hg'),
    altitudeFt: real('altitude_ft'),
    humidityPct: real('humidity_pct'),
    windSpeedMph: real('wind_speed_mph'),
    windDirClock: integer('wind_dir_clock'),
    targetPhotoUri: text('target_photo_uri'),
    notes: text('notes'),
    ...timestamps,
    ...archivable,
  },
  (t) => [
    index('range_sessions_rifle_idx').on(t.rifleId),
    index('range_sessions_load_version_idx').on(t.loadVersionId),
  ],
);

// Observed DOPE: what actually worked at a distance. Distances canonical in
// yards; holds stored in the value + unit the shooter dialed, so a later
// turret-unit change on the rifle can't silently corrupt history.
export const dopeEntries = sqliteTable(
  'dope_entries',
  {
    id: id(),
    sessionId: text('session_id')
      .notNull()
      .references(() => rangeSessions.id),
    distanceYd: real('distance_yd').notNull(),
    elevationHold: real('elevation_hold'),
    windageHold: real('windage_hold'),
    holdUnit: text('hold_unit', { enum: ['MIL', 'MOA'] }),
    groupSizeIn: real('group_size_in'),
    poiUpIn: real('poi_up_in'),
    poiRightIn: real('poi_right_in'),
    confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('dope_entries_session_idx').on(t.sessionId)],
);

// Card configuration only — rows are always computed at render/export time by
// merging solver output with confirmed dopeEntries.
export const rangeCards = sqliteTable(
  'range_cards',
  {
    id: id(),
    rifleId: text('rifle_id')
      .notNull()
      .references(() => rifles.id),
    loadVersionId: text('load_version_id')
      .notNull()
      .references(() => loadVersions.id),
    preset: text('preset', { enum: ['bench', 'hunting'] }).notNull().default('bench'),
    startDistanceYd: real('start_distance_yd').notNull().default(100),
    endDistanceYd: real('end_distance_yd').notNull().default(1000),
    incrementYd: real('increment_yd').notNull().default(50),
    mvOverrideFps: real('mv_override_fps'),
    // Drag truing: multiplies the load's BC (1 = published). Stage 2 of the
    // two-stage truing flow — the right knob when MV is known from a chrono,
    // since the residual long-range error is then drag rather than velocity.
    bcScaleFactor: real('bc_scale_factor'),
    atmoSnapshot: text('atmo_snapshot', { mode: 'json' }),
    latitudeDeg: real('latitude_deg'), // degrees, -90..90 (south negative); Coriolis
    azimuthDeg: real('azimuth_deg'), // degrees, 0..360 from true north; Coriolis
    inclineDeg: real('incline_deg'), // degrees, uphill positive; incline-fire correction
    // Seed the card's wind from the latest logged session wind (see
    // latestSessionWind) instead of zero wind.
    useLoggedWind: integer('use_logged_wind', { mode: 'boolean' }).notNull().default(false),
    // Applied only when the load version has bulletLengthIn + bulletDiameterIn.
    spinDriftEnabled: integer('spin_drift_enabled', { mode: 'boolean' }).notNull().default(true),
    ...timestamps,
    ...archivable,
  },
  (t) => [
    index('range_cards_rifle_idx').on(t.rifleId),
    // One card per rifle + load version; getOrCreateCard relies on this to
    // stay race-free (insert .onConflictDoNothing() + re-select).
    uniqueIndex('range_cards_rifle_load_version_unq').on(t.rifleId, t.loadVersionId),
  ],
);

export type Rifle = typeof rifles.$inferSelect;
export type NewRifle = typeof rifles.$inferInsert;
export type Load = typeof loads.$inferSelect;
export type NewLoad = typeof loads.$inferInsert;
export type LoadVersion = typeof loadVersions.$inferSelect;
export type NewLoadVersion = typeof loadVersions.$inferInsert;
export type Workup = typeof workups.$inferSelect;
export type NewWorkup = typeof workups.$inferInsert;
export type WorkupStep = typeof workupSteps.$inferSelect;
export type ShotString = typeof shotStrings.$inferSelect;
export type Shot = typeof shots.$inferSelect;
export type RangeSession = typeof rangeSessions.$inferSelect;
export type NewRangeSession = typeof rangeSessions.$inferInsert;
export type DopeEntry = typeof dopeEntries.$inferSelect;
export type NewDopeEntry = typeof dopeEntries.$inferInsert;
export type RangeCard = typeof rangeCards.$inferSelect;
export type NewRangeCard = typeof rangeCards.$inferInsert;

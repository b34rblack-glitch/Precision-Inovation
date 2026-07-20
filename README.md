# Precision Innovation

A clean, simple mobile app for precision rifle shooters and handloaders. Three segments,
one workflow: **Rifle → Load → Range**.

Existing reloading apps bury you in required fields and never connect a firearm to a load
to real range results. This app is built around exactly that missing loop:

1. **Rifles** — profiles for each firearm: cartridge, barrel, optic, sight height,
   turret units (MIL or MOA per rifle), distance units (yards or meters per rifle), zero.
   Only the name is required; everything else is progressive disclosure.
2. **Loads** — versioned recipes (bullet, BC, powder, charge, primer, brass, CBTO/COAL).
   Editing a load that already has range history automatically creates a **new version**,
   so old results stay tied to the exact recipe that produced them. Guided workups walk
   you through **ladder**, **OCW**, and **velocity (Satterlee)** tests: the app generates
   the charge series, gives you per-charge entry sheets, computes SD/ES from per-shot
   chrono velocities, highlights **velocity flat spots**, and lets you promote the winning
   charge to a new load version in one tap.
3. **Range** — log sessions (conditions, chrono strings, target results) and record the
   holds that actually worked (**DOPE**). The **range card** is hybrid: a built-in
   point-mass ballistic solver (G1/G7) predicts every distance, and your confirmed DOPE
   overrides the predictions wherever you've proven the hold — confirmed rows are marked
   **●**, predictions **○**. One tap trues muzzle velocity against your confirmed
   long-range holds. Cards come in **Bench** and **Hunting** presets, a high-contrast
   **field mode** (amber on black, huge digits, screen stays awake), and **PDF export**
   sized for a stock pack.

## Tech

- **Expo SDK 57** (managed workflow, runs in Expo Go) + **expo-router** + TypeScript strict
- **expo-sqlite + Drizzle ORM** — offline-first, all data on-device, JSON backup/export
- **Pure-TS ballistics engine** (`src/lib/ballistics/`): RK4 point-mass integration,
  McCoy G1/G7 drag tables, ICAO atmosphere with humidity correction, Newton zeroing.
  Cross-validated against `js-ballistics` (py_ballisticcalc port) to within 0.5 in of
  drop and 3 fps at every 100 yd increment to 1000 yd.

## Development

```bash
npm install --legacy-peer-deps
npm start            # Expo dev server → scan QR with Expo Go
npm test             # Vitest: units, atmosphere, solver, merge, workup stats
npm run typecheck    # tsc --noEmit
```

Database schema lives in `src/db/schema.ts`; regenerate migrations with
`npx drizzle-kit generate` after schema changes.

## Safety

This app records and organizes *your* data — it does not validate load safety. Always
start from published load data and work up while watching for pressure signs.

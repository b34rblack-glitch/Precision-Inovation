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

- **Expo SDK 57** + **expo-router** + TypeScript strict. Runs in Expo Go, except
  cloud sync, which needs native code and therefore a development build.
- **expo-sqlite + Drizzle ORM** — offline-first, all data on-device, JSON backup/export
- **Optional Google Drive sync** (`src/sync/`) — no server and no hosting cost.
  Each device keeps a complete snapshot in a folder in the user's *own* Drive
  and merges row-by-row using a hybrid logical clock, so edits made on two
  devices while offline both survive. See `docs/google-cloud-setup.md`.
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
`npx drizzle-kit generate` after schema changes. This repo is the only place
migrations are generated — the desktop app vendors the same `.sql` files.

Every write goes through `src/db/mutate.ts`, which stamps a logical timestamp
and records tombstones for deletes. `__tests__/sync/funnel.test.ts` fails the
build if a write appears anywhere else; that guarantee is what sync depends on.

## Sync

Sync is opt-in and costs the developer nothing, because there is no backend:
users who want it sign in with Google and the app writes to a
`Precision Innovation` folder in their own Drive using the non-sensitive
`drive.file` scope, which can only ever see files the app itself created.

The merge engine (`src/sync/merge.ts`) is pure and has no I/O, so the code that
could destroy data is the code that is cheapest to test. `__tests__/sync/`
covers each conflict rule in isolation, drives the whole protocol end to end
against an in-memory Drive, and fuzzes three devices with deliberately skewed
clocks through random offline edits and sync orders to prove they converge.

## Safety

This app records and organizes *your* data — it does not validate load safety. Always
start from published load data and work up while watching for pressure signs.

import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import * as schema from './schema';

// Database initialization is LAZY and FALLIBLE on purpose. openDatabaseSync /
// execSync at module scope crash natively (before React mounts) if anything
// throws — e.g. a corrupt db file or missing native module. By deferring init
// to first use, any failure surfaces after React is up, where it can be caught
// and rendered (app/_layout.tsx calls tryInitDb() and shows an error screen).

function createDb(client: SQLiteDatabase) {
  return drizzle(client, { schema });
}
type DrizzleDb = ReturnType<typeof createDb>;

let realSqlite: SQLiteDatabase | null = null;
let realDb: DrizzleDb | null = null;
let initError: Error | null = null;

function initDb(): DrizzleDb {
  if (realDb) return realDb;
  try {
    const client = openDatabaseSync('precision.db', { enableChangeListener: true });
    client.execSync('PRAGMA foreign_keys = ON;');
    realSqlite = client;
    realDb = createDb(client);
    initError = null;
    return realDb;
  } catch (e) {
    initError = e instanceof Error ? e : new Error(String(e));
    throw initError;
  }
}

/** Last database init error, or null if init succeeded / hasn't run yet. */
export function getDbInitError(): Error | null {
  return initError;
}

/** Force init now; returns the error instead of throwing (null on success). */
export function tryInitDb(): Error | null {
  try {
    initDb();
    return null;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

/**
 * Lazy pass-through proxy: resolves the real instance on first property
 * access, binds methods to it (drizzle relies on `this`), and forwards string
 * and symbol keys alike (drizzle's `is()` reads an entityKind symbol).
 */
function lazyProxy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const instance = resolve();
      const value = Reflect.get(instance, prop, instance);
      return typeof value === 'function' ? value.bind(instance) : value;
    },
    set(_target, prop, value) {
      return Reflect.set(resolve(), prop, value);
    },
    has(_target, prop) {
      return Reflect.has(resolve(), prop);
    },
    getPrototypeOf() {
      return Object.getPrototypeOf(resolve());
    },
    ownKeys() {
      return Reflect.ownKeys(resolve());
    },
    getOwnPropertyDescriptor(_target, prop) {
      const desc = Reflect.getOwnPropertyDescriptor(resolve(), prop);
      // Keep proxy invariants happy: the dummy target has no own properties.
      if (desc) desc.configurable = true;
      return desc;
    },
  });
}

export const sqlite: SQLiteDatabase = lazyProxy(() => {
  initDb();
  return realSqlite!;
});

export const db: DrizzleDb = lazyProxy(() => initDb());

export type DB = DrizzleDb;

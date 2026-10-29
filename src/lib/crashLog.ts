import { File, Paths } from 'expo-file-system';

// Crash capture. A release build closes on any uncaught JavaScript error with
// nothing to show for it but Android's "this app has a bug" sheet. This hooks
// the global error handler, writes what it caught (plus the last few things
// the user did) to a file BEFORE the default handler takes the app down, and
// Settings shows that file on the next launch so the report can be shared.
//
// Native (Java) crashes never reach JavaScript and leave no file. An empty
// report after a crash is itself the answer: the fault is native, and
// `adb logcat -b crash` is the next step.

export type CrashReport = {
  at: string;
  message: string;
  stack: string | null;
  fatal: boolean;
  /** Oldest first. */
  breadcrumbs: string[];
  /** Where it was caught. */
  source: 'global-handler' | 'error-boundary';
  componentStack?: string | null;
};

const FILE_NAME = 'last-crash.json';
const MAX_CRUMBS = 40;
const crumbs: string[] = [];

const crashFile = () => new File(Paths.document, FILE_NAME);

/** Note what just happened; the last 40 travel with the next crash report. */
export function crumb(label: string): void {
  crumbs.push(`${new Date().toISOString().slice(11, 23)} ${label}`);
  if (crumbs.length > MAX_CRUMBS) crumbs.shift();
}

function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack ?? null };
  return { message: String(error), stack: null };
}

/** Write the report synchronously; the process may be gone a moment later. */
export function writeCrashReport(report: CrashReport): void {
  try {
    const file = crashFile();
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(report, null, 2));
  } catch {
    // Nothing left to do: the crash handler must never throw.
  }
}

export function reportFor(
  error: unknown,
  source: CrashReport['source'],
  extra: { fatal?: boolean; componentStack?: string | null } = {},
): CrashReport {
  const { message, stack } = describe(error);
  return {
    at: new Date().toISOString(),
    message,
    stack,
    fatal: extra.fatal ?? true,
    breadcrumbs: [...crumbs],
    source,
    componentStack: extra.componentStack ?? null,
  };
}

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = {
  getGlobalHandler: () => GlobalErrorHandler;
  setGlobalHandler: (handler: GlobalErrorHandler) => void;
};

let installed = false;

/** Hook React Native's global handler once; the previous handler still runs. */
export function installCrashCapture(): void {
  if (installed) return;
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils) return;
  installed = true;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    writeCrashReport(reportFor(error, 'global-handler', { fatal: isFatal ?? true }));
    previous(error, isFatal);
  });
}

export function readCrashReport(): CrashReport | null {
  try {
    const file = crashFile();
    if (!file.exists) return null;
    return JSON.parse(file.textSync()) as CrashReport;
  } catch {
    return null;
  }
}

export function clearCrashReport(): void {
  try {
    const file = crashFile();
    if (file.exists) file.delete();
  } catch {
    // Ignore: the card will show again next launch, which is harmless.
  }
}

/** Plain text for sharing or pasting. */
export function formatCrashReport(r: CrashReport): string {
  return [
    `Precision Innovation crash report`,
    `When: ${r.at}`,
    `Caught by: ${r.source}${r.fatal ? ' (fatal)' : ''}`,
    ``,
    r.message,
    ``,
    `Stack:`,
    r.stack ?? '(none)',
    r.componentStack ? `\nComponent stack:\n${r.componentStack}` : '',
    ``,
    `Last actions (oldest first):`,
    ...(r.breadcrumbs.length ? r.breadcrumbs : ['(none recorded)']),
  ].join('\n');
}

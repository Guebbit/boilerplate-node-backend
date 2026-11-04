/**
 * @module
 * An unexpected warning fails the case that caused it, unless the case said it expects one.
 *
 * Watches:  `console.warn`, `console.error`, and `process` `'warning'` events (a
 *           DeprecationWarning, MaxListenersExceededWarning, a driver warning).
 * Why:      a green run hides all three, and a deprecation is cheapest to fix the day it appears.
 * Started:  by `setup-fail-on-warning.ts` around every case; a case meets it only through
 *           {@link expectWarning}.
 *
 * A case that spies on the console itself stands on top of this watcher and never reaches it,
 * so it keeps its own control of what it expects.
 */

/** What a declared warning is matched against: a substring, or a pattern. */
export type WarningMatcher = string | RegExp;

/** The console methods watched. */
export type ConsoleTarget = Pick<Console, 'warn' | 'error'>;

/** The slice of `process` the watcher listens on. */
export interface WarningEmitter {
    on(event: 'warning', listener: (warning: Error) => void): unknown;
    off(event: 'warning', listener: (warning: Error) => void): unknown;
}

/** The console methods wrapped, in the order they are restored. */
const WATCHED = ['warn', 'error'] as const;

/**
 * Whether a warning satisfies a declared matcher.
 * @param matcher substring or pattern the case declared
 * @param warning the warning text
 * @returns true when it matches
 */
const matches = (matcher: WarningMatcher, warning: string): boolean =>
    typeof matcher === 'string' ? warning.includes(matcher) : matcher.test(warning);

/**
 * The text of a console call's arguments, as one string to match against.
 * @param args what was passed to `console.warn` / `console.error`
 * @returns the arguments joined; an `Error` contributes its message
 */
const textOf = (args: unknown[]): string =>
    args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');

/**
 * Watches one console and one process for warnings across a single case.
 * @param target the console to wrap; a parameter so the watcher is testable against a fake
 * @param emitter the process whose `'warning'` events count
 * @returns `start` (before the case), `expect` (declare a warning), `finish` (after; throws)
 */
export const createWarningWatcher = (target: ConsoleTarget, emitter: WarningEmitter) => {
    /** Warnings seen since `start`. */
    let seen: string[] = [];

    /** Matchers the case declared. */
    let declared: WarningMatcher[] = [];

    /** The console methods as they were at `start`, put back at `finish`. */
    let originals: ConsoleTarget | undefined;

    /** Records a process warning as `Name: message`. */
    const onProcessWarning = (warning: Error): void => {
        seen.push(`${warning.name}: ${warning.message}`);
    };

    /** Wraps one console method: record the call, then pass it on so it still prints. */
    const wrap = (kind: (typeof WATCHED)[number], original: ConsoleTarget[typeof kind]) => {
        target[kind] = (...args: unknown[]) => {
            seen.push(`console.${kind}: ${textOf(args)}`);
            original.apply(target, args);
        };
    };

    return {
        /** Begins watching with an empty slate. */
        start: (): void => {
            seen = [];
            declared = [];
            originals = { warn: target.warn, error: target.error };
            for (const kind of WATCHED) wrap(kind, originals[kind]);
            emitter.on('warning', onProcessWarning);
        },

        /** Declares that this case warns; the warning must fire, or the case fails. */
        expect: (matcher: WarningMatcher): void => {
            declared.push(matcher);
        },

        /**
         * Stops watching and fails on any warning nobody declared, or any declaration that never fired.
         * @throws {Error} listing the unexpected warnings and the declarations that never fired
         */
        finish: (): void => {
            emitter.off('warning', onProcessWarning);
            if (originals) Object.assign(target, originals);
            originals = undefined;

            const unexpected = seen.filter((warning) =>
                declared.every((m) => !matches(m, warning))
            );
            const unfired = declared.filter((m) => seen.every((warning) => !matches(m, warning)));
            if (unexpected.length === 0 && unfired.length === 0) return;

            throw new Error(
                [
                    ...unexpected.map((warning) => `Unexpected warning: ${warning}`),
                    ...unfired.map((m) => `Declared warning never fired: ${String(m)}`)
                ].join('\n')
            );
        }
    };
};

/** The one watcher `setup-fail-on-warning.ts` runs around every case. */
export const warnings = createWarningWatcher(console, process);

/**
 * Declares that the running case warns, and that is the point of it.
 * The warning must fire, so a declaration that went stale fails the case.
 * @param matcher a substring or pattern of the warning text
 */
export const expectWarning = (matcher: WarningMatcher): void => {
    warnings.expect(matcher);
};

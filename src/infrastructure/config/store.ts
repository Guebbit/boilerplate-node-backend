/**
 * @module
 * The one place the process environment is read, and the one place it can be overridden.
 *
 * Reads:       `process.env`, live, with the overrides laid over it.
 * Overrides:   `createApp({ env })` installs one for good; the test helpers set one for a body
 *              and put it back.
 * Lives on:    `globalThis`, so a `jest.resetModules()` re-import still sees the same overrides.
 *
 * Everything else asks a slice (`defineConfig`), and a slice asks {@link currentEnvironment}.
 * See: docs/tools/configuration.md
 */

/** A set of environment variables, as `process.env` shapes them. */
export type Environment = Readonly<Record<string, string | undefined>>;

/** Variable name to value; `undefined` means "unset this variable", whatever the snapshot holds. */
export type EnvironmentOverrides = Readonly<Record<string, string | undefined>>;

/** What the store remembers between reads. */
interface StoreState {
    /** Overrides over `process.env`. A key holding `undefined` hides the process value. */
    readonly overrides: Map<string, string | undefined>;
    /** The overrides {@link resetEnvironmentOverrides} goes back to; empty until a mark is set. */
    marked: ReadonlyMap<string, string | undefined>;
}

/**
 * Where the state hangs on `globalThis`. `Symbol.for` hands every module instance the same key,
 * which is the point: a reset registry re-evaluates this file and must find the state intact.
 */
const STATE_KEY = Symbol.for('boilerplate-node-backend.config.store');

/** The global object, typed for the one slot this file keeps on it. */
const holder = globalThis as typeof globalThis & { [STATE_KEY]?: StoreState };

/**
 * The state, created on first use.
 *
 * @returns the one store state of this realm
 */
const state = (): StoreState => {
    holder[STATE_KEY] ??= { overrides: new Map(), marked: new Map() };
    return holder[STATE_KEY];
};

/**
 * The environment every slice reads from right now: `process.env` with the overrides on top.
 *
 * @returns the process environment itself when nothing is overridden, otherwise a merged copy
 */
export const currentEnvironment = (): Environment => {
    const { overrides } = state();
    if (overrides.size === 0) return process.env;

    const merged = new Map(Object.entries(process.env));
    for (const [name, value] of overrides) {
        if (value === undefined) merged.delete(name);
        else merged.set(name, value);
    }
    return Object.fromEntries(merged);
};

/**
 * Lays overrides over the environment. Passing `undefined` for a name unsets it.
 *
 * @param entries - variable name to value
 * @returns a function that puts every named variable's override back as it was before this call
 */
export const overrideEnvironment = (entries: EnvironmentOverrides): (() => void) => {
    const { overrides } = state();
    // Saved per NAME and per override entry: "no override" and "overridden to unset" differ.
    const before = Object.keys(entries).map(
        (name) => [name, overrides.has(name), overrides.get(name)] as const
    );
    for (const [name, value] of Object.entries(entries)) overrides.set(name, value);

    return () => {
        for (const [name, had, value] of before) {
            if (had) overrides.set(name, value);
            else overrides.delete(name);
        }
    };
};

/**
 * Installs overrides for the life of the process: `createApp({ env })`'s door. Same layer as
 * {@link overrideEnvironment}, with no way back, because an app has no "afterwards".
 *
 * @param entries - variable name to value
 */
export const installEnvironment = (entries: EnvironmentOverrides): void => {
    overrideEnvironment(entries);
};

/**
 * Remembers the overrides as they are now, as the state a reset returns to. A test harness sets
 * its per-file overrides, marks, and every case then starts from them.
 */
export const markEnvironmentOverrides = (): void => {
    const store = state();
    store.marked = new Map(store.overrides);
};

/**
 * Puts the overrides back to the last mark (none: no overrides, `process.env` alone). A test's
 * way of ending its own changes.
 */
export const resetEnvironmentOverrides = (): void => {
    const { overrides, marked } = state();
    // Refilled in place, not replaced: an undo handed out earlier holds this very Map.
    overrides.clear();
    for (const [name, value] of marked) overrides.set(name, value);
};

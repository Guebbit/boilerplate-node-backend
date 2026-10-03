/**
 * @module
 * The one place the process environment is read, and the one place it can be overridden.
 *
 * Reads:       `process.env`, ONCE — the first read freezes a snapshot (parse once).
 * Overrides:   a layer on top of the snapshot. `createApp({ env })` installs one for good; the
 *              test helpers set one for a body and put it back.
 * Lives on:    `globalThis`, so a `jest.resetModules()` re-import still sees the same state.
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
    /** `process.env` as the first read saw it, until {@link refreshEnvironment} takes it again. */
    snapshot: Environment | undefined;
    /** Overrides over the snapshot. A key holding `undefined` hides the snapshot's value. */
    readonly overrides: Map<string, string | undefined>;
    /** The overrides {@link resetEnvironmentOverrides} goes back to; empty until a mark is set. */
    marked: ReadonlyMap<string, string | undefined>;
    /** Bumped on every change, so a slice knows its parsed copy went stale. */
    version: number;
    /** Snapshot plus overrides, rebuilt only when `version` moved past `mergedVersion`. */
    merged: Environment | undefined;
    /** The `version` that `merged` was built at. */
    mergedVersion: number;
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
    holder[STATE_KEY] ??= {
        snapshot: undefined,
        overrides: new Map(),
        marked: new Map(),
        version: 0,
        merged: undefined,
        mergedVersion: -1
    };
    return holder[STATE_KEY];
};

/**
 * The environment every slice reads from right now: the frozen snapshot with the overrides on top.
 * The same object is returned until something changes.
 *
 * @returns the effective environment
 */
export const currentEnvironment = (): Environment => {
    const store = state();
    if (store.merged && store.mergedVersion === store.version) return store.merged;

    // Taken at the first read: whatever `process.env` gains later is not seen.
    store.snapshot ??= Object.freeze({ ...process.env });
    const merged = new Map(Object.entries(store.snapshot));
    for (const [name, value] of store.overrides) {
        if (value === undefined) merged.delete(name);
        else merged.set(name, value);
    }
    store.merged = Object.freeze(Object.fromEntries(merged));
    store.mergedVersion = store.version;
    return store.merged;
};

/**
 * A number that changes whenever {@link currentEnvironment} would return different values. A
 * slice keeps its parsed copy for exactly as long as this stays put.
 *
 * @returns the current version
 */
export const environmentVersion = (): number => state().version;

/**
 * Takes the snapshot again, from `process.env` as it is now. For the one code path that
 * legitimately changes the process environment after startup: loading `.env`.
 */
export const refreshEnvironment = (): void => {
    const store = state();
    store.snapshot = undefined;
    store.version += 1;
};

/**
 * Lays overrides over the environment. Passing `undefined` for a name unsets it.
 *
 * @param entries - variable name to value
 * @returns a function that puts every named variable's override back as it was before this call
 */
export const overrideEnvironment = (entries: EnvironmentOverrides): (() => void) => {
    const store = state();
    // Saved per NAME and per override entry: "no override" and "overridden to unset" differ.
    const before = Object.keys(entries).map(
        (name) => [name, store.overrides.has(name), store.overrides.get(name)] as const
    );
    for (const [name, value] of Object.entries(entries)) store.overrides.set(name, value);
    store.version += 1;

    return () => {
        for (const [name, had, value] of before) {
            if (had) store.overrides.set(name, value);
            else store.overrides.delete(name);
        }
        store.version += 1;
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
 * Puts the overrides back to the last mark (none: the snapshot alone). A test's way of ending its
 * own changes.
 */
export const resetEnvironmentOverrides = (): void => {
    const store = state();
    // Refilled in place, not replaced: an undo handed out earlier holds this very Map.
    store.overrides.clear();
    for (const [name, value] of store.marked) store.overrides.set(name, value);
    store.version += 1;
};
